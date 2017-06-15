/* @requires
mapshaper-pathfinder
mapshaper-polygon-holes
mapshaper-dissolve
mapshaper-data-aggregation
*/

internal.dissolvePolygonLayer = function(lyr, nodes, opts) {
  opts = opts || {};
  var getGroupId = internal.getCategoryClassifier(opts.field, lyr.data);
  var groups = lyr.shapes.reduce(function(groups, shape, i) {
    var i2 = getGroupId(i);
    if (i2 in groups === false) {
      groups[i2] = [];
    }
    internal.extendShape(groups[i2], shape);
    return groups;
  }, []);
  var dissolve = internal.getPolygonDissolver(nodes);
  var lyr2, data2;

  if (lyr.data) {
    data2 = new DataTable(internal.aggregateDataRecords(lyr.data.getRecords(), getGroupId, opts));
  }
  lyr2 = {
    name: opts.no_replace ? null : lyr.name,
    data: data2,
    shapes: groups.map(dissolve),
    geometry_type: lyr.geometry_type
  };
  internal.printDissolveMessage(lyr, lyr2, 'dissolve2');
  return lyr2;
};

internal.concatShapes = function(shapes) {
  return shapes.reduce(function(memo, shape) {
    internal.extendShape(memo, shape);
    return memo;
  }, []);
};

internal.extendShape = function(dest, src) {
  if (src) {
    for (var i=0, n=src.length; i<n; i++) {
      dest.push(src[i]);
    }
  }
};

internal.getPolygonDissolver = function(nodes, spherical) {
  spherical = spherical && !nodes.arcs.isPlanar();
  var flags = new Uint8Array(nodes.arcs.size());
  var divide = internal.getHoleDivider(nodes, spherical);
  var flatten = internal.getRingIntersector(nodes, 'flatten', flags, spherical);
  var dissolve = internal.getRingIntersector(nodes, 'dissolve', flags, spherical);

  return function(shp) {
    if (!shp) return null;
    var cw = [],
        ccw = [];

    divide(shp, cw, ccw);
    cw = flatten(cw);
    ccw.forEach(internal.reversePath);
    ccw = flatten(ccw);
    ccw.forEach(internal.reversePath);

    var shp2 = internal.appendHolestoRings(cw, ccw);
    var dissolved = dissolve(shp2);
    return dissolved.length > 0 ? dissolved : null;
  };
};

// TODO: to prevent invalid holes,
// could erase the holes from the space-enclosing rings.
internal.appendHolestoRings = function(cw, ccw) {
  for (var i=0, n=ccw.length; i<n; i++) {
    cw.push(ccw[i]);
  }
  return cw;
};
