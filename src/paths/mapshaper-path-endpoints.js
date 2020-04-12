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
