/* @requires mapshaper-info, mapshaper-expressions, mapshaper-shape-geom */

api.inspect = function(lyr, arcs, opts) {
  var ids = MapShaper.selectFeatures(lyr, arcs, opts);
  var msg;
  if (ids.length == 1) {
    msg = MapShaper.getFeatureInfo(ids[0], lyr, arcs);
  } else {
    msg = utils.format("[inspect] Expression matched %d feature%s. Select one feature for details", ids.length, utils.pluralSuffix(ids.length));
  }
  message(msg);
};

MapShaper.getFeatureInfo = function(id, lyr, arcs) {
    var msg = "Feature " + id + '\n';
    msg += MapShaper.getShapeInfo(id, lyr, arcs);
    msg += MapShaper.getTableInfo(lyr, id);
    return msg;
};

MapShaper.getShapeInfo = function(id, lyr, arcs) {
  var shp = lyr.shapes ? lyr.shapes[id] : null;
  var type = lyr.geometry_type;
  var info, msg;
  if (!shp || !type) {
    return 'Geometry: [null]\n';
  }
  msg = 'Geometry\n  Type: ' + type + '\n';
  if (type == 'point') {
    msg += '  Points: ' + shp.length + '\n';
  } else if (type == 'polyline') {
    msg += '  Parts: ' + shp.length + '\n';
  } else if (type == 'polygon') {
    info = MapShaper.getPolygonInfo(shp, arcs);
    msg += utils.format('  Rings: %d cw, %d ccw\n', info.cw, info.ccw);
    msg += '  Planar area: ' + info.area + '\n';
    if (info.sph_area) {
      msg += '  Spherical area: ' + info.sph_area + ' sq. meters\n';
    }
  }
  return msg;
};

MapShaper.getPolygonInfo = function(shp, arcs) {
  var o = {rings: shp.length, cw: 0, ccw: 0, area: 0};
  var area;
  for (var i=0; i<shp.length; i++) {
    area = geom.getPlanarPathArea(shp[i], arcs);
    if (area > 0) {
      o.cw++;
    } else if (area < 0) {
      o.ccw++;
    }
    o.area += area;
  }
  if (!arcs.isPlanar()) {
    o.sph_area = geom.getSphericalShapeArea(shp, arcs);
  }
  return o;
};

MapShaper.selectFeatures = function(lyr, arcs, opts) {
  var n = MapShaper.getFeatureCount(lyr),
      ids = [],
      filter;
  if (!opts.expression) {
    stop("[inspect] Missing a JS expression for selecting a feature");
  }
  filter = MapShaper.compileValueExpression(opts.expression, lyr, arcs);
  utils.repeat(n, function(id) {
    var result = filter(id);
    if (result === true) {
      ids.push(id);
    } else if (result !== false) {
      stop("[inspect] Expression must return true or false");
    }
  });
  return ids;
};
