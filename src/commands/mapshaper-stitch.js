/* @requires
mapshaper-dissolve2
mapshaper-shape-utils
mapshaper-path-division
*/

// WORK IN PROGRESS
// Remove 'cuts' in an unprojected dataset at the antemeridian and poles.
// This will be useful when generating rotated projections.
//
api.stitch = function(dataset) {
  var arcs = dataset.arcs,
      edgeArcs, dissolver, nodes;
  if (!arcs || arcs.isPlanar()) {
    error("[stitch] Requires lat-lng dataset");
  }
  if (!MapShaper.snapEdgeArcs(arcs)) {
    return;
  }
  nodes = MapShaper.divideArcs(dataset);
  // console.log(arcs.toArray())

  dissolver = MapShaper.getPolygonDissolver(nodes, !!'spherical');
  dataset.layers.forEach(function(lyr) {
    if (lyr.geometry_type != 'polygon') return;
    var shapes = lyr.shapes,
        edgeShapeIds = MapShaper.findEdgeShapes(shapes, arcs);
    edgeShapeIds.forEach(function(i) {
      shapes[i] = dissolver(shapes[i]);
    });
  });
};

// TODO: test with 'wrapped' datasets
MapShaper.findEdgeArcs = function(arcs) {
  var bbox = MapShaper.getWorldBounds(),
      ids = [];
  for (var i=0, n=arcs.size(); i<n; i++) {
    if (!arcs.arcIsContained(i, bbox)) {
      ids.push(i);
    }
  }
  return ids;
};

MapShaper.findEdgeShapes = function(shapes, arcs) {
  var arcIds = MapShaper.findEdgeArcs(arcs);
  return MapShaper.findShapesByArcId(shapes, arcIds, arcs.size());
};

// Snap arcs that either touch poles or prime meridian to 0 degrees longitude
// Return array of affected arc ids
MapShaper.snapEdgeArcs = function(arcs) {
  var data = arcs.getVertexData(),
      xx = data.xx,
      yy = data.yy,
      onEdge = false,
      e = 1e-10, // TODO: justify this...
      xmin = -180,
      xmax = 180,
      ymin = -90,
      ymax = 90,
      lat, lng;
  for (var i=0, n=xx.length; i<n; i++) {
    lat = yy[i];
    lng = xx[i];
    if (lng <= xmin + e || lng >= xmax - e) {
      onEdge = true;
      xx[i] = xmin;
      // console.log(">>> snapped lat:", lat, "lng:", lng, "to lng:", xmin);
    }
    if (lat <= ymin + e) {
      onEdge = true;
      yy[i] = ymin;
      xx[i] = xmin;
    } else if (lat >= ymax - e) {
      onEdge = true;
      yy[i] = ymax;
      xx[i] = xmin;
    }
  }
  return onEdge;
};
