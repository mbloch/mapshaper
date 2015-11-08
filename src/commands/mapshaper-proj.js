/* @requires
mapshaper-common
mapshaper-projections
mapshaper-geom
mapshaper-arc-editor
*/

api.proj = function(dataset, opts) {
  var proj = MapShaper.getProjection(opts.projection, opts);
  if (!proj) {
    stop("[proj] Unknown projection:", opts.projection);
  }
  MapShaper.projectDataset(dataset, proj, opts);
};

MapShaper.getProjection = function(name, opts) {
  var f = MapShaper.projectionIndex[name.toLowerCase().replace(/-_ /g, '')];
  return f ? new f(opts) : null;
};

MapShaper.printProjections = function() {
  var names = Object.keys(MapShaper.projectionIndex);
  names.sort();
  names.forEach(function(n) {
    message(n);
  });
};

MapShaper.projectDataset = function(dataset, proj, opts) {
  dataset.layers.forEach(function(lyr) {
    if (MapShaper.layerHasPoints(lyr)) {
      MapShaper.projectPointLayer(lyr, proj);
    }
  });
  if (dataset.arcs) {
    if (opts.densify) {
      MapShaper.projectAndDensifyArcs(dataset.arcs, proj);
    } else {
      MapShaper.projectArcs(dataset.arcs, proj);
    }
  }
  if (dataset.info) {
    // Setting output crs to null: "If the value of CRS is null, no CRS can be assumed"
    // (by default, GeoJSON assumes WGS84)
    // source: http://geojson.org/geojson-spec.html#coordinate-reference-system-objects
    // TODO: create a valid GeoJSON crs object after projecting
    dataset.info.output_crs = null;
    dataset.info.output_prj = null;
  }
};

MapShaper.projectPointLayer = function(lyr, proj) {
  var xy = {x: 0, y: 0};
  MapShaper.forEachPoint(lyr, function(p) {
    proj.projectLatLng(p[1], p[0], xy);
    p[0] = xy.x;
    p[1] = xy.y;
  });
};

MapShaper.projectArcs = function(arcs, proj) {
  var data = arcs.getVertexData(),
      xx = data.xx,
      yy = data.yy,
      // old zz will not be optimal after reprojection; re-using it for now
      // to avoid error in web ui
      zz = data.zz,
      p = {x: 0, y: 0};
  if (arcs.isPlanar()) {
    stop("[proj] Only projection from lat-lng coordinates is supported");
  }
  for (var i=0, n=xx.length; i<n; i++) {
    proj.projectLatLng(yy[i], xx[i], p);
    xx[i] = p.x;
    yy[i] = p.y;
  }
  arcs.updateVertexData(data.nn, xx, yy, zz);
};

MapShaper.getDefaultDensifyInterval = function(arcs, proj) {
  var xy = arcs.getAvgSegment2(),
      bb = arcs.getBounds(),
      a = proj.projectLatLng(bb.centerY(), bb.centerX()),
      b = proj.projectLatLng(bb.centerY() + xy[1], bb.centerX());
  return distance2D(a.x, a.y, b.x, b.y);
};

// Interpolate points into a projected line segment if needed to prevent large
//   deviations from path of original unprojected segment.
// @points (optional) array of accumulated points
MapShaper.densifySegment = function(lng0, lat0, x0, y0, lng2, lat2, x2, y2, proj, interval, points) {
  // Find midpoint between two endpoints and project it (assumes longitude does
  // not wrap). TODO Consider bisecting along great circle path -- although this
  // would not be good for boundaries that follow line of constant latitude.
  var lng1 = (lng0 + lng2) / 2,
      lat1 = (lat0 + lat2) / 2,
      p = proj.projectLatLng(lat1, lng1),
      distSq = geom.pointSegDistSq(p.x, p.y, x0, y0, x2, y2); // sq displacement
  points = points || [];
  // Bisect current segment if the projected midpoint deviates from original
  //   segment by more than the @interval parameter.
  //   ... but don't bisect very small segments to prevent infinite recursion
  //   (e.g. if projection function is discontinuous)
  if (distSq > interval * interval && distance2D(lng0, lat0, lng2, lat2) > 0.01) {
    MapShaper.densifySegment(lng0, lat0, x0, y0, lng1, lat1, p.x, p.y, proj, interval, points);
    points.push(p);
    MapShaper.densifySegment(lng1, lat1, p.x, p.y, lng2, lat2, x2, y2, proj, interval, points);
  }
  return points;
};

MapShaper.projectAndDensifyArcs = function(arcs, proj) {
  var interval = MapShaper.getDefaultDensifyInterval(arcs, proj);
  var tmp = {x: 0, y: 0};
  MapShaper.editArcs(arcs, onPoint);

  function onPoint(append, lng, lat, prevLng, prevLat, i) {
    var p = tmp,
        prevX = p.x,
        prevY = p.y;
    proj.projectLatLng(lat, lng, p);
    // Try to densify longer segments (optimization)
    if (i > 0 && distanceSq(p.x, p.y, prevX, prevY) > interval * interval * 25) {
      MapShaper.densifySegment(prevLng, prevLat, prevX, prevY, lng, lat, p.x, p.y, proj, interval)
        .forEach(append);
    }
    append(p);
  }
};
