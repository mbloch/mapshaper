/* @requires
mapshaper-polygon-mosaic
mapshaper-index-index
mapshaper-polygon-tiler
mapshaper-tile-shape-index
*/

function MosaicIndex(lyr, nodes, optsArg) {
  var opts = optsArg || {};
  var shapes = lyr.shapes;
  var divide = internal.getHoleDivider(nodes);
  var mosaic = internal.buildPolygonMosaic(nodes).mosaic;

  // map arc ids to tile ids
  var arcTileIndex = new ShapeArcIndex(mosaic, nodes.arcs);
  // keep track of which tiles have been assigned to shapes
  var fetchedTileIndex = new IndexIndex(mosaic.length);
  // bidirection index of tile ids <=> shape ids
  var tileShapeIndex = new TileShapeIndex(mosaic, opts);
  // assign tiles to shapes
  var shapeTiler = new PolygonTiler(mosaic, arcTileIndex, nodes, opts);

  var weightFunction = getAreaWeightFunction(lyr.shapes, nodes.arcs);

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
    return getUnusedTileIds().map(tileIdToTile);
  };

  this.getTilesByShapeIds = function(shapeIds) {
    return getTileIdsByShapeIds(shapeIds).map(tileIdToTile);
  };

  function getAreaWeightFunction(shapes, arcs) {
    var index = [];
    return function(shpId) {
      var weight;
      if (shpId in index) {
        weight = index[shpId];
      } else {
        weight = index[shpId] = Math.abs(geom.getShapeArea(shapes[shpId], arcs));
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
    fetchedTileIndex.clearIds(uniqIds);
    return uniqIds;
  }
}


// Map arc ids to shape ids, assuming perfect topology
// (an arcId maps to at most one shape)
// Supports looking up a shape id using an arc id.
function ShapeArcIndex(shapes, arcs) {
  var n = arcs.size();
  var fwdArcIndex = new Int32Array(n);
  var revArcIndex = new Int32Array(n);
  var shapeId;
  utils.initializeArray(fwdArcIndex, -1);
  utils.initializeArray(revArcIndex, -1);
  shapes.forEach(onShape);

  function onShape(shp, i) {
    shapeId = i;
    shp.forEach(onPart);
  }
  function onPart(path) {
    var arcId;
    for (var i=0, n=path.length; i<n; i++) {
      arcId = path[i];
      if (arcId < 0) {
        revArcIndex[~arcId] = shapeId;
      } else {
        fwdArcIndex[arcId] = shapeId;
      }
    }
  }

  // returns -1 if shape has not been indexed
  this.getShapeIdByArcId = function(arcId) {
    var idx = absArcId(arcId);
    if (idx >= n) return -1; // TODO: throw error (out-of-range id)
    return arcId < 0 ? revArcIndex[idx] : fwdArcIndex[idx];
  };
}
