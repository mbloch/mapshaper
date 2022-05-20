import { debug } from '../utils/mapshaper-logging';
import { absArcId } from '../paths/mapshaper-arc-utils';
import { IdTestIndex } from '../indexing/mapshaper-id-test-index';
import { getHoleDivider } from '../polygons/mapshaper-polygon-holes';

// Associate mosaic tiles with shapes (i.e. identify the groups of tiles that
//   belong to each shape)
//
export function PolygonTiler(mosaic, arcTileIndex, nodes, opts) {
  var arcs = nodes.arcs;
  var visitedTileIndex = new IdTestIndex(mosaic.length, true);
  var divide = getHoleDivider(nodes);
  // temp vars
  var currHoles; // arc ids of all holes in shape
  var currShapeId;
  var currRingBbox;
  var tilesInShape; // accumulator for tile ids of tiles in current shape
  var ringIndex = new IdTestIndex(arcs.size(), true);
  var holeIndex = new IdTestIndex(arcs.size(), true);

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
    holeIndex.clear();
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
    ringIndex.clear();
    // allow overlapping rings to visit the same tiles
    visitedTileIndex.clear();
  }

  // optimized version: traversal without recursion (to avoid call stack oflo, excessive gc, etc)
  function procArcIds(ids) {
    var stack = ids.concat();
    var arcId, tileId;
    while (stack.length > 0) {
      arcId = stack.pop();
      tileId = procRingArc(arcId);
      if (tileId >= 0) {
        accumulateTraversibleArcIds(stack, mosaic[tileId]);
      }
    }
  }

  function accumulateTraversibleArcIds(ids, tile) {
    var arcId, ring;
    for (var j=0, n=tile.length; j<n; j++) {
      ring = tile[j];
      for (var i=0, m=ring.length; i<m; i++) {
        arcId = ring[i];
        if (arcIsTraversible(arcId)) {
          ids.push(~arcId);
        }
      }
    }
  }

  function arcIsTraversible(tileArc) {
    var neighborArc = ~tileArc;
    var traversible = !(ringIndex.hasId(tileArc) || ringIndex.hasId(neighborArc) || holeIndex.hasId(tileArc) || holeIndex.hasId(neighborArc));
    return traversible;
  }

  function procRingArc(arcId) {
    var tileId = arcTileIndex.getShapeIdByArcId(arcId);
    if (tileId == -1 || visitedTileIndex.hasId(tileId)) return -1;
    if (arcs.arcIsContained(absArcId(arcId), currRingBbox) === false) {
      // don't cross boundary of the current ring or of any hole in the current shape
      // TODO: this indicates a geometry bug that should be fixed
      debug('Out-of-bounds ring arc', arcId);
      return -1;
    }
    visitedTileIndex.setId(tileId);
    tilesInShape.push(tileId);
    return tileId;
  }
}
