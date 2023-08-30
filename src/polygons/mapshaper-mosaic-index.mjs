
import { TileShapeIndex } from '../polygons/mapshaper-tile-shape-index';
import { getHoleDivider } from '../polygons/mapshaper-polygon-holes';
import { buildPolygonMosaic } from '../polygons/mapshaper-polygon-mosaic';
import { IdTestIndex } from '../indexing/mapshaper-id-test-index';
import { ArcLookupIndex } from '../indexing/mapshaper-id-lookup-index';
import { PolygonTiler } from '../polygons/mapshaper-polygon-tiler';
import { error, stop } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';

export function MosaicIndex(lyr, nodes, optsArg) {
  var opts = optsArg || {};
  var shapes = lyr.shapes;
  var divide = getHoleDivider(nodes);
  var mosaic = buildPolygonMosaic(nodes).mosaic;
  // map arc ids to tile ids
  var arcTileIndex = new ShapeArcIndex(mosaic, nodes.arcs);
  // keep track of which tiles have been assigned to shapes
  var fetchedTileIndex = new IdTestIndex(mosaic.length, true);
  // bidirection index of tile ids <=> shape ids
  var tileShapeIndex = new TileShapeIndex(mosaic, opts);
  // assign tiles to shapes
  var shapeTiler = new PolygonTiler(mosaic, arcTileIndex, nodes, opts);
  var weightFunction = null;
  if (!opts.simple && opts.flat) {
    // opts.simple is an optimization when dissolving everything into one polygon
    // using -dissolve2. In this situation, we don't need a weight function.
    // Otherwise, if polygons are being dissolved into multiple groups,
    // we use a function to assign tiles in overlapping areas to a single shape.
    weightFunction = getOverlapPriorityFunction(lyr.shapes, nodes.arcs, opts.overlap_rule);
  }
  this.mosaic = mosaic;
  this.nodes = nodes; // kludge
  this.getSourceIdsByTileId = tileShapeIndex.getShapeIdsByTileId; // expose for -mosaic command
  this.getTileIdsByShapeId = tileShapeIndex.getTileIdsByShapeId;

  // Assign shape ids to mosaic tile shapes.
  shapes.forEach(function(shp, shapeId) {
    var tileIds = shapeTiler.getTilesInShape(shp, shapeId);
    tileShapeIndex.indexTileIdsByShapeId(shapeId, tileIds, weightFunction);
  });

  // ensure each tile is assigned to only one shape
  if (opts.flat) {
    tileShapeIndex.flatten();
  }

  // fill gaps
  // (assumes that tiles have been allocated to shapes and mosaic has been flattened)
  this.removeGaps = function(filter) {
    if (!opts.flat) {
      error('MosaicIndex#removeGaps() should only be called with a flat mosaic');
    }
    var remainingIds = tileShapeIndex.getUnusedTileIds();
    var filledIds = remainingIds.filter(function(tileId) {
      var tile = mosaic[tileId];
      return filter(tile[0]); // test tile ring, ignoring any holes (does this matter?)
    });
    filledIds.forEach(assignTileToAdjacentShape);
    return {
      removed: filledIds.length,
      remaining: remainingIds.length - filledIds.length
    };
  };

  this.getUnusedTiles = function() {
    return tileShapeIndex.getUnusedTileIds().map(tileIdToTile);
  };

  this.getTilesByShapeIds = function(shapeIds) {
    return getTileIdsByShapeIds(shapeIds).map(tileIdToTile);
  };

  function getOverlapPriorityFunction(shapes, arcs, rule) {
    var f;
    if (!rule || rule == 'max-area') {
      f = getAreaWeightFunction(shapes, arcs, false);
    } else if (rule == 'min-area') {
      f = getAreaWeightFunction(shapes, arcs, true);
    } else if (rule == 'max-id') {
      f = function(shapeId) {
        return shapeId; };
    } else if (rule == 'min-id') {
      f = function(shapeId) { return -shapeId; };
    } else {
      stop('Unknown overlap rule:', rule);
    }
    return f;
  }

  function getAreaWeightFunction(shapes, arcs, invert) {
    var index = [];
    var sign = invert ? -1 : 1;
    return function(shpId) {
      var weight;
      if (shpId in index) {
        weight = index[shpId];
      } else {
        weight = sign * Math.abs(geom.getShapeArea(shapes[shpId], arcs));
        index[shpId] = weight;
      }
      return weight;
    };
  }

  function tileIdToTile(id, i) {
    return mosaic[id];
  }

  function assignTileToAdjacentShape(tileId) {
    var ring = mosaic[tileId][0];
    var arcs = nodes.arcs;
    var arcId, neighborShapeId, neighborTileId, arcLen;
    var shapeId = -1, maxArcLen = 0;
    for (var i=0; i<ring.length; i++) {
      arcId = ring[i];
      neighborTileId = arcTileIndex.getShapeIdByArcId(~arcId);
      if (neighborTileId < 0) continue;
      neighborShapeId = tileShapeIndex.getShapeIdByTileId(neighborTileId);
      if (neighborShapeId < 0) continue;
      arcLen = geom.getPathPerimeter([arcId], arcs);
      if (arcLen > maxArcLen) {
        shapeId = neighborShapeId;
        maxArcLen = arcLen;
      }
    }
    if (shapeId > -1) {
      tileShapeIndex.addTileToShape(shapeId, tileId);
    }
  }

  function getTileIdsByShapeIds(shapeIds) {
    var uniqIds = [];
    var tileId, tileIds, i, j;
    for (i=0; i<shapeIds.length; i++) {
      tileIds = tileShapeIndex.getTileIdsByShapeId(shapeIds[i]);
      for (j=0; j<tileIds.length; j++) {
        tileId = tileIds[j];
        // uniqify tile ids (in case the shape contains overlapping rings)
        if (fetchedTileIndex.hasId(tileId)) continue;
        fetchedTileIndex.setId(tileId);
        uniqIds.push(tileId);
      }
    }
    // clearing this index allows duplicate tile ids between calls to this function
    // (should not happen in a typical dissolve)
    fetchedTileIndex.clear();
    return uniqIds;
  }
}

// Map arc ids to shape ids, assuming perfect topology
// (an arcId maps to at most one shape)
// Supports looking up a shape id using an arc id.
export function ShapeArcIndex(shapes, arcs) {
  var n = arcs.size();
  var index = new ArcLookupIndex(n);
  var shapeId;
  shapes.forEach(onShape);

  function onShape(shp, i) {
    shapeId = i;
    shp.forEach(onPart);
  }
  function onPart(path) {
    var arcId;
    for (var i=0, n=path.length; i<n; i++) {
      arcId = path[i];
      index.setId(arcId, shapeId);
    }
  }

  // returns -1 if shape has not been indexed
  this.getShapeIdByArcId = function(arcId) {
    return index.getId(arcId);
  };
}
