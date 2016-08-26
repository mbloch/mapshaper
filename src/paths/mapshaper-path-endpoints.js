/* @requires mapshaper-shape-utils */

// Test if the second endpoint of an arc is the endpoint of any path in any layer
MapShaper.getPathEndpointTest = function(layers, arcs) {
  var index = new Uint8Array(arcs.size());
  layers.forEach(function(lyr) {
    if (MapShaper.layerHasPaths(lyr)) {
      lyr.shapes.forEach(addShape);
    }
  });

  function addShape(shape) {
    MapShaper.forEachPath(shape, addPath);
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
};
