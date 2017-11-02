/* @requires mapshaper-shape-utils */

// Return an interior point for each space-containing ring
internal.findInnerPoints = function(shp, arcs) {
  var groups, points;
  if (!shp) {
    points = null; // null shape
  } else {
    groups = shp.length == 1 ? [shp] : internal.findPotentialRingGroups(shp, arcs);
    points = internal.findInnerPoints2(groups, arcs);
  }
  return points;
};

internal.findInnerPoints2 = function(shapes, arcs) {
  return shapes.map(function(shp) {
    return internal.findInnerPoint(shp, arcs);
  });
};

internal.findPotentialRingGroups = function(shp, arcs) {
  var data = internal.getPathMetadata(shp, arcs, 'polygon');
  var groups = [];
  // sort shp parts by descending bbox area
  data.sort(function(a, b) {
    return b.bounds.area() - a.bounds.area();
  });
  data.forEach(function(d, i) {
    if (d.area > 0 === false) return; // skip holes
    groups.push(utils.pluck(data.slice(i), 'ids'));
  });
  return groups;
};


// assume: shp[0] is outer ring
internal.findInnerPoint = function(shp, arcs) {
};
