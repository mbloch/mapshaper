/* @requires mapshaper-polygon-intersection, mapshaper-polygon-holes, mapshaper-dissolve */

api.dissolvePolygons2 = function(lyr, dataset, opts) {
  MapShaper.requirePolygonLayer(lyr, "[dissolve2] Expected a polygon type layer");
  var nodes = MapShaper.divideArcs(dataset);
  return MapShaper.dissolvePolygonLayer(lyr, nodes, opts);
};

MapShaper.dissolvePolygonLayer = function(lyr, nodes, opts) {
  opts = opts || {};
  var getGroupId = MapShaper.getCategoryClassifier(opts.field, lyr.data);
  var groups = lyr.shapes.reduce(function(groups, shape, i) {
    var i2 = getGroupId(i);
    if (i2 in groups === false) {
      groups[i2] = [];
    }
    MapShaper.extendShape(groups[i2], shape);
    return groups;
  }, []);
  var dissolve = MapShaper.getPolygonDissolver(nodes);
  var lyr2, data2;

  T.start();
  if (lyr.data) {
    data2 = new DataTable(MapShaper.calcDissolveData(lyr.data.getRecords(), getGroupId, opts));
  }
  lyr2 = {
    name: opts.no_replace ? null : lyr.name,
    data: data2,
    shapes: groups.map(dissolve),
    geometry_type: lyr.geometry_type
  };
  T.stop('dissolve2');
  MapShaper.printDissolveMessage(lyr, lyr2, 'dissolve2');
  return lyr2;
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

MapShaper.getPolygonDissolver = function(nodes, spherical) {
  spherical = spherical && !nodes.arcs.isPlanar();
  var flags = new Uint8Array(nodes.arcs.size());
  var divide = MapShaper.getHoleDivider(nodes, spherical);
  var flatten = MapShaper.getRingIntersector(nodes, 'flatten', flags, spherical);
  var dissolve = MapShaper.getRingIntersector(nodes, 'dissolve', flags, spherical);

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
