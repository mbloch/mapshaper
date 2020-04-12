import { debug } from '../utils/mapshaper-logging';
import { absArcId } from '../paths/mapshaper-arc-utils';
import { IdTestIndex } from '../indexing/mapshaper-id-test-index';
import { getHoleDivider } from '../polygons/mapshaper-polygon-holes';

// Associate mosaic tiles with shapes (i.e. identify the groups of tiles that
//   belong to each shape)
//
export function PolygonTiler(mosaic, arcTileIndex, nodes, opts) {
  var arcs = nodes.arcs;
  var visitedTileIndex = new IdTestIndex(mosaic.length);
  var divide = getHoleDivider(nodes);
  // temp vars
  var currHoles; // arc ids of all holes in shape
  var currShapeId;
  var currRingBbox;
  var tilesInShape; // accumulator for tile ids of tiles in current shape
  var ringIndex = new IdTestIndex(arcs.size());
  var holeIndex = new IdTestIndex(arcs.size());

  // return ids of tiles in shape
  this.getTilesInShape = function(shp, shapeId) {
    var cw = [], ccw = [], retn;
    tilesInShape = [];
    currHoles = [];
    currShapeId = shapeId;
    if (opts.no_holes) {
      divide(shp, cw, ccw);
      // ccw.forEach(internal.reversePath);
      // cw = cw.concat(ccw);
    } else {
      // divide shape into rings and holes (splits self-intersecting rings)
      // TODO: rewrite divide() -- it is a performance bottleneck and can convert
      //   space-filling areas into ccw holes
      divide(shp, cw, ccw);
      ccw.forEach(procShapeHole);
      holeIndex.setIds(currHoles);
    }
    cw.forEach(procShapeRing);
    retn = tilesInShape;
    // reset tmp vars, etc
    tilesInShape = null;
    holeIndex.clearIds(currHoles);
    currHoles = null;
    return retn;
  };

  function procShapeHole(path) {
    currHoles = currHoles ? currHoles.concat(path) : path;
  }

  function procShapeRing(path) {
    currRingBbox = arcs.getSimpleShapeBounds2(path);
    ringIndex.setIds(path);
    procArcIds(path);
    ringIndex.clearIds(path);
    // allow overlapping rings to visit the same tiles
    visitedTileIndex.clearIds(tilesInShape);
  }

  // ids: an array of arcIds
  function procArcIds(ids) {
    var tileIds = [], tileId;
    for (var i=0, n=ids.length; i<n; i++) {
      tileId = procRingArc(ids[i]);
      if (tileId > -1) tileIds.push(tileId);
    }
    if (tileIds.length > 0) traverseFromTiles(tileIds);
  }

  function traverseFromTiles(tileIds) {
    // breadth-first traversal, to prevent call stack overflow when there is
    // a large number of tiles within a ring (due to many partially overlapping rings)
    var arcIds = [];
    for (var i=0, n=tileIds.length; i<n; i++) {
      accumulateTraversibleArcIds(arcIds, mosaic[tileIds[i]]);
    }
    if (arcIds.length > 0) procArcIds(arcIds);
  }

  function accumulateTraversibleArcIds(ids, tile) {
    var arcId, ring;
    for (var j=0; j<tile.length; j++) {
      ring = tile[j];
      for (var i=0; i<ring.length; i++) {
        arcId = ring[i];
        if (arcIsTraversible(arcId)) {
          ids.push(~arcId);
        }
      }
    }
  }

  function arcIsTraversible(tileArc) {
    var neighborArc = ~tileArc;
    // don't cross boundary of the current ring or of any hole in the current shape
    var traversible = !(holeIndex.hasId(tileArc) || holeIndex.hasId(neighborArc)  ||
      ringIndex.hasId(tileArc) || ringIndex.hasId(neighborArc));
    if (traversible && arcs.arcIsContained(absArcId(neighborArc), currRingBbox) === false) {
      debug('Out-of-bounds traversal error in arc', tileArc);
      traversible = false;
    }
    return traversible;
  }

  function procRingArc(arcId) {
    var tileId = arcTileIndex.getShapeIdByArcId(arcId);
    if (arcs.arcIsContained(absArcId(arcId), currRingBbox) === false) {
      debug('Out-of-bounds ring arc', arcId);
      tileId = -1;
    }
    if (tileId == -1 || visitedTileIndex.hasId(tileId)) return -1;
    visitedTileIndex.setId(tileId);
    tilesInShape.push(tileId);
    return tileId;
  }
}
