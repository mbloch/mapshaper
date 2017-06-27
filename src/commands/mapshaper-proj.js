/* @requires
mapshaper-projections
mapshaper-geom
mapshaper-arc-editor
mapshaper-shape-utils
*/

api.proj = function(dataset, srcDefn, destDefn, opts_) {
  // modify copy of coordinate data when running in web UI, so original shapes
  // are preserved if an error occurs
  var modifyCopy = !!api.gui,
      opts = opts_ || {},
      originals = [],
      target = {},
      src, dest, defn, prj, tmp;

  if (!srcDefn && !destDefn) {
    stop("Missing projection data");
  }

  if (srcDefn) {
    src = internal.getProjection(srcDefn);
    if (!src) {
      stop("Unknown projection:", srcDefn);
    }
  }

  if (!destDefn) {
    // just set CRS of dataset
    dataset.info.crs = src;
    return;
  }

  dest = internal.getProjection(destDefn);
  if (!dest) {
    stop("Unknown projection:", destDefn);
  }

  if (!src) {
    // get from dataset
    src = internal.getDatasetProjection(dataset);
    if (!src) {
      stop("Unable to project -- source coordinate system is unknown");
    }
  }

  if (internal.crsAreEqual(src, dest)) {
    message("Source and destination CRS are the same");
    return;
  }

  if (dataset.arcs) {
    dataset.arcs.flatten(); // bake in any pending simplification
    target.arcs = modifyCopy ? dataset.arcs.getCopy() : dataset.arcs;
  }

  target.layers = dataset.layers.filter(internal.layerHasPoints).map(function(lyr) {
    if (modifyCopy) {
      originals.push(lyr);
      lyr = utils.extend({}, lyr);
      lyr.shapes = internal.cloneShapes(lyr.shapes);
    }
    return lyr;
  });

  try {
    internal.projectDataset(target, src, dest, opts);
  } catch(e) {
    stop(utils.format("Projection failure%s (%s)",
      e.point ? ' at ' + e.point.join(' ') : '', e.message));
  }

  if (dataset.info) {
    dataset.info.crs = dest;
  }

  dataset.arcs = target.arcs;
  originals.forEach(function(lyr, i) {
    // replace original layers with modified layers
    utils.extend(lyr, target.layers[i]);
  });
};

// @source: a layer identifier, .prj file or projection defn
// Converts layer ids and .prj files to projection defn
// Returns projection defn
internal.getProjectionString = function(sourceName, catalog) {
  var dataset, sources, defn, P;
  if (/\.prj$/i.test(sourceName)) {
    dataset = api.importFile(sourceName, {});
    if (dataset) {
      defn = internal.translatePrj(dataset.info.input_prj);
    }
  } else {
    sources = catalog.findCommandTargets(sourceName);
    if (sources.length > 0) {
      P = internal.getDatasetProjection(sources[0].dataset);
      defn = internal.crsToProj4(P);
    }
  }
  if (!defn) {
    // assume sourceName is a projection defn
    defn = sourceName;
  }
  return defn;
};

internal.projectDataset = function(dataset, src, dest, opts) {
  var proj = internal.getProjTransform(src, dest);
  dataset.layers.forEach(function(lyr) {
    if (internal.layerHasPoints(lyr)) {
      internal.projectPointLayer(lyr, proj);
    }
  });
  if (dataset.arcs) {
    if (opts.densify) {
      internal.projectAndDensifyArcs(dataset.arcs, proj);
    } else {
      internal.projectArcs(dataset.arcs, proj);
    }
  }
};

internal.getProjTransform = function(src, dest) {
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

internal.projectPointLayer = function(lyr, proj) {
  internal.forEachPoint(lyr.shapes, function(p) {
    var p2 = proj(p[0], p[1]);
    p[0] = p2[0];
    p[1] = p2[1];
  });
};

internal.projectArcs = function(arcs, proj) {
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

internal.getDefaultDensifyInterval = function(arcs, proj) {
  var xy = internal.getAvgSegment2(arcs),
      bb = arcs.getBounds(),
      a = proj(bb.centerX(), bb.centerY()),
      b = proj(bb.centerX() + xy[0], bb.centerY() + xy[1]);
  return distance2D(a[0], a[1], b[0], b[1]);
};

// Interpolate points into a projected line segment if needed to prevent large
//   deviations from path of original unprojected segment.
// @points (optional) array of accumulated points
internal.densifySegment = function(lng0, lat0, x0, y0, lng2, lat2, x2, y2, proj, interval, points) {
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
    internal.densifySegment(lng0, lat0, x0, y0, lng1, lat1, p[0], p[1], proj, interval, points);
    points.push(p);
    internal.densifySegment(lng1, lat1, p[0], p[1], lng2, lat2, x2, y2, proj, interval, points);
  }
  return points;
};

internal.projectAndDensifyArcs = function(arcs, proj) {
  var interval = internal.getDefaultDensifyInterval(arcs, proj);
  var p = [0, 0];
  internal.editArcs(arcs, onPoint);

  function onPoint(append, lng, lat, prevLng, prevLat, i) {
    var prevX = p[0],
        prevY = p[1];
    p = proj(lng, lat);
    // Don't try to optimize shorter segments (optimization)
    if (i > 0 && distanceSq(p[0], p[1], prevX, prevY) > interval * interval * 25) {
      internal.densifySegment(prevLng, prevLat, prevX, prevY, lng, lat, p[0], p[1], proj, interval)
        .forEach(append);
    }
    append(p);
  }
};
