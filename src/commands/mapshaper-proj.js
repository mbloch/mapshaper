/* @requires
mapshaper-projections
mapshaper-geom
mapshaper-arc-editor
mapshaper-shape-utils
*/

api.proj = function(dataset, opts) {
  var useCopy = !!api.gui; // modify copy when running in web UI
  var target, src, dest, defn;

  if (opts && opts.from) {
    src = MapShaper.getProjection(opts.from, opts);
    if (!src) {
      stop("[proj] Unknown source projection:", opts.from);
    }
  } else {
    src = MapShaper.getDatasetProjection(dataset);
    if (!src) {
      stop("[proj] Unable to project -- source coordinate system is unknown");
    }
  }

  dest = MapShaper.getProjection(opts.projection, opts);
  if (!dest) {
    stop("[proj] Unknown projection:", opts.projection);
  }

  if (useCopy) {
    // make deep copy of objects that will get modified
    target = {};
    if (dataset.arcs) {
      target.arcs = dataset.arcs.getCopy();
    }
    target.layers = dataset.layers.map(function(lyr) {
      if (MapShaper.layerHasPoints(lyr)) {
        lyr = utils.extend({}, lyr);
        lyr.shapes = MapShaper.cloneShapes(lyr.shapes);
      }
      return lyr;
    });
  } else {
    target = dataset; // project in-place
  }

  try {
    MapShaper.projectDataset(target, src, dest, opts);
  } catch(e) {
    stop(utils.format("[proj] Projection failure%s (%s)",
      e.point ? ' at ' + e.point.join(' ') : '', e.message));
  }

  if (useCopy) {
    // replace originals with modified copies
    dataset.arcs = target.arcs;
    dataset.layers = target.layers;
  }

  if (dataset.info) {
    dataset.info.crs = dest;
  }
};


MapShaper.projectDataset = function(dataset, src, dest, opts) {
  var proj = MapShaper.getProjTransform(src, dest);
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
};

MapShaper.getProjTransform = function(src, dest) {
  var mproj = require('mproj');
  var clampSrc = src.is_latlong;
  return function(x, y) {
    var xy;
    if (clampSrc) {
      // snap lng to bounds
      if (x < -180) x = -180;
      else if (x > 180) x = 180;
    }
    xy = [x, y];
    mproj.pj_transform_point(src, dest, xy);
    return xy;
  };
};

MapShaper.projectPointLayer = function(lyr, proj) {
  MapShaper.forEachPoint(lyr.shapes, function(p) {
    var p2 = proj(p[0], p[1]);
    p[0] = p2[0];
    p[1] = p2[1];
  });
};

MapShaper.projectArcs = function(arcs, proj) {
  var data = arcs.getVertexData(),
      xx = data.xx,
      yy = data.yy,
      // old simplification data  will not be optimal after reprojection;
      // re-using for now to avoid error in web ui
      zz = data.zz,
      p;

  for (var i=0, n=xx.length; i<n; i++) {
    p = proj(xx[i], yy[i]);
    xx[i] = p[0];
    yy[i] = p[1];
  }
  arcs.updateVertexData(data.nn, xx, yy, zz);
};

MapShaper.getDefaultDensifyInterval = function(arcs, proj) {
  var xy = MapShaper.getAvgSegment2(arcs),
      bb = arcs.getBounds(),
      a = proj(bb.centerX(), bb.centerY()),
      b = proj(bb.centerX() + xy[0], bb.centerY() + xy[1]);
  return distance2D(a[0], a[1], b[0], b[1]);
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
      p = proj(lng1, lat1),
      distSq = geom.pointSegDistSq(p[0], p[1], x0, y0, x2, y2); // sq displacement
  points = points || [];
  // Bisect current segment if the projected midpoint deviates from original
  //   segment by more than the @interval parameter.
  //   ... but don't bisect very small segments to prevent infinite recursion
  //   (e.g. if projection function is discontinuous)
  if (distSq > interval * interval * 0.25 && distance2D(lng0, lat0, lng2, lat2) > 0.01) {
    MapShaper.densifySegment(lng0, lat0, x0, y0, lng1, lat1, p[0], p[1], proj, interval, points);
    points.push(p);
    MapShaper.densifySegment(lng1, lat1, p[0], p[1], lng2, lat2, x2, y2, proj, interval, points);
  }
  return points;
};

MapShaper.projectAndDensifyArcs = function(arcs, proj) {
  var interval = MapShaper.getDefaultDensifyInterval(arcs, proj);
  var p = [0, 0];
  MapShaper.editArcs(arcs, onPoint);

  function onPoint(append, lng, lat, prevLng, prevLat, i) {
    var prevX = p[0],
        prevY = p[1];
    p = proj(lng, lat);
    // Don't try to optimize shorter segments (optimization)
    if (i > 0 && distanceSq(p[0], p[1], prevX, prevY) > interval * interval * 25) {
      MapShaper.densifySegment(prevLng, prevLat, prevX, prevY, lng, lat, p[0], p[1], proj, interval)
        .forEach(append);
    }
    append(p);
  }
};
