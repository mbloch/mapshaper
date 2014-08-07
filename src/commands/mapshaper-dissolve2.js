/* @requires mapshaper-polygon-intersection, mapshaper-polygon-holes */


api.dissolvePolygonLayers2 = function(layers, dataset, opts) {
  var nodes = MapShaper.divideArcs(dataset.layers, dataset.arcs);
  var dissolvedLayers = layers.map(function(lyr) {
    var shapes2 = MapShaper.dissolveAllPolygons(lyr.shapes, nodes);
    return Utils.defaults({shapes: shapes2, data: null}, lyr);
  });
  return dissolvedLayers;
};

// TODO: dissolve on attributes, to replace current dissolve command
MapShaper.dissolveAllPolygons = function(shapes, nodes) {
  var rings = MapShaper.concatShapes(shapes);
  var dissolve = MapShaper.getPolygonDissolver(nodes);
  var dissolved = dissolve(rings);
  return [dissolved];
};

MapShaper.concatShapes = function(shapes) {
  return shapes.reduce(function(memo, shape) {
    if (shape) {
      for (var i=0, n=shape.length; i<n; i++) {
        memo.push(shape[i]);
      }
    }
    return memo;
  }, []);
};

MapShaper.getPolygonDissolver = function(nodes) {
  var flags = new Uint8Array(nodes.arcs.size());
  var divide = MapShaper.getHoleDivider(nodes, flags);
  var flatten = MapShaper.getRingIntersector(nodes, 'flatten', flags);
  var dissolve = MapShaper.getRingIntersector(nodes, 'dissolve', flags);

  return function(shp) {
    if (!shp) return null;
    var cw = [],
        ccw = [];

    divide(shp, cw, ccw);
    cw = flatten(cw);
    ccw.forEach(MapShaper.reversePath);
    ccw = flatten(ccw);
    ccw.forEach(MapShaper.reversePath);

    var shp2 = MapShaper.appendHolestoRings(cw, ccw);
    var dissolved = dissolve(shp2);
    return dissolved.length > 0 ? dissolved : null;
  };
};


// TODO: to prevent invalid holes,
// could erase the holes from the space-enclosing rings.
MapShaper.appendHolestoRings = function(cw, ccw) {
  for (var i=0, n=ccw.length; i<n; i++) {
    cw.push(ccw[i]);
  }
  return cw;
};
