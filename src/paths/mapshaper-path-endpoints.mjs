import { absArcId } from '../paths/mapshaper-arc-utils';
import { forEachShapePart } from '../paths/mapshaper-shape-utils';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';

// Test if the second endpoint of an arc is the endpoint of any path in any layer
export function getPathEndpointTest(layers, arcs) {
  var index = new Uint8Array(arcs.size());
  layers.forEach(function(lyr) {
    if (layerHasPaths(lyr)) {
      lyr.shapes.forEach(addShape);
    }
  });

  function addShape(shape) {
    forEachShapePart(shape, addPath);
  }

  function addPath(path) {
    addEndpoint(~path[0]);
    addEndpoint(path[path.length - 1]);
  }

  function addEndpoint(arcId) {
    var absId = absArcId(arcId);
    var fwd = absId == arcId;
    index[absId] |= fwd ? 1 : 2;
  }

  return function(arcId) {
    var absId = absArcId(arcId);
    var fwd = absId == arcId;
    var code = index[absId];
    return fwd ? (code & 1) == 1 : (code & 2) == 2;
  };
}

// The open paths in @lyr with an endpoint exactly at @p ([x, y]), as
// [{shapeId, partId, atStart}, ...], where atStart means the path starts at @p.
// A closed path has no ends. Used by -add-shape extend, and by the GUI's line
// tool to tell which lines a path started at @p would extend.
export function findLineEnds(lyr, arcs, p) {
  var matches = [];
  if (!arcs) return matches;
  (lyr.shapes || []).forEach(function(shp, shapeId) {
    (shp || []).forEach(function(ids, partId) {
      var a = arcs.getVertex(ids[0], 0);
      var b = arcs.getVertex(ids[ids.length - 1], -1);
      if (a.x == b.x && a.y == b.y) return;
      if (a.x == p[0] && a.y == p[1]) matches.push({shapeId, partId, atStart: true});
      if (b.x == p[0] && b.y == p[1]) matches.push({shapeId, partId, atStart: false});
    });
  });
  return matches;
}
