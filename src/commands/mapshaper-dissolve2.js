/* @requires mapshaper-polygon-intersection, mapshaper-polygon-holes */


api.dissolvePolygons2 = function(lyr, dataset, opts) {
  MapShaper.requirePolygonLayer(lyr, "[dissolve] only supports polygon type layers");
  var nodes = MapShaper.divideArcs(dataset);
  return MapShaper.dissolvePolygonLayer(lyr, nodes, opts);
};

MapShaper.dissolvePolygonLayer = function(lyr, nodes, opts) {
  opts = opts || {};
  var getKey = MapShaper.getKeyFunction(opts.field, lyr.data);
  var lyr2 = {data: null};
  var index = {};
  var groups = lyr.shapes.reduce(function(groups, shape, i) {
    var key = getKey(i);
    if (key in index === false) {
      index[key] = groups.length;
      groups.push([]);
    }
    MapShaper.extendShape(groups[index[key]], shape);
    return groups;
  }, []);

  var dissolve = MapShaper.getPolygonDissolver(nodes);
  lyr2.shapes = groups.map(function(group) {
    return dissolve(group);
  });

  if (lyr.data) {
    lyr2.data = new DataTable(MapShaper.calcDissolveData(lyr.data.getRecords(), getKey, index, opts));
  }
  return Utils.defaults(lyr2, lyr);
};

MapShaper.concatShapes = function(shapes) {
  return shapes.reduce(function(memo, shape) {
    MapShaper.extendShape(memo, shape);
    return memo;
  }, []);
};

MapShaper.extendShape = function(dest, src) {
  if (src) {
    for (var i=0, n=src.length; i<n; i++) {
      dest.push(src[i]);
    }
  }
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
