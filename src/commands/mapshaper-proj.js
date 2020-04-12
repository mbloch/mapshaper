import { getAvgSegment2 } from '../paths/mapshaper-path-utils';
import { editArcs } from '../paths/mapshaper-arc-editor';
import { editShapes, cloneShapes } from '../paths/mapshaper-shape-utils';
import { getProjTransform2, getCRS, parsePrj, crsAreEqual, getDatasetCRS } from '../geom/mapshaper-projections';
import { layerHasPoints } from '../dataset/mapshaper-layer-utils';
import { datasetHasGeometry } from '../dataset/mapshaper-dataset-utils';
import { runningInBrowser } from '../mapshaper-state';
import { stop, message } from '../utils/mapshaper-logging';
import { importFile } from '../io/mapshaper-file-import';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import geom from '../geom/mapshaper-geom';


cmd.proj = function(dataset, destInfo, opts) {
  // modify copy of coordinate data when running in web UI, so original shapes
  // are preserved if an error occurs
  var modifyCopy = runningInBrowser(),
      originals = [],
      target = {},
      src, dest;

  dest = destInfo.crs;
  if (!dest) {
    stop("Missing projection data");
  }

  if (!datasetHasGeometry(dataset)) {
    // still set the crs of datasets that are missing geometry
    dataset.info.crs = dest;
    dataset.info.prj = destInfo.prj; // may be undefined
    return;
  }

  src = getDatasetCRS(dataset);
  if (!src) {
    stop("Unable to project -- source coordinate system is unknown");
  }

  if (crsAreEqual(src, dest)) {
    message("Source and destination CRS are the same");
    return;
  }

  if (dataset.arcs) {
    dataset.arcs.flatten(); // bake in any pending simplification
    target.arcs = modifyCopy ? dataset.arcs.getCopy() : dataset.arcs;
  }

  target.layers = dataset.layers.filter(layerHasPoints).map(function(lyr) {
    if (modifyCopy) {
      originals.push(lyr);
      lyr = utils.extend({}, lyr);
      lyr.shapes = cloneShapes(lyr.shapes);
    }
    return lyr;
  });

  try {
    projectDataset(target, src, dest, opts || {});
  } catch(e) {
    console.error(e);
    stop(utils.format("Projection failure%s (%s)",
      e.point ? ' at ' + e.point.join(' ') : '', e.message));
  }

  dataset.info.crs = dest;
  dataset.info.prj = destInfo.prj; // may be undefined
  dataset.arcs = target.arcs;
  originals.forEach(function(lyr, i) {
    // replace original layers with modified layers
    utils.extend(lyr, target.layers[i]);
  });
};


// @source: a layer identifier, .prj file or projection defn
// Converts layer ids and .prj files to CRS defn
// Returns projection defn
export function getCrsInfo(name, catalog) {
  var dataset, sources, info = {};
  if (/\.prj$/i.test(name)) {
    dataset = importFile(name, {});
    if (dataset) {
      info.prj = dataset.info.prj;
      info.crs = parsePrj(info.prj);
    }
  } else {
    sources = catalog.findCommandTargets(name);
    if (sources.length > 0) {
      dataset = sources[0].dataset;
      info.crs = getDatasetCRS(dataset);
      info.prj = dataset.info.prj; // may be undefined
      // defn = internal.crsToProj4(P);
    } else {
      // assume name is a projection defn
      info.crs = getCRS(name);
    }
  }
  return info;
}

export function projectDataset(dataset, src, dest, opts) {
  var proj = getProjTransform2(src, dest); // v2 returns null points instead of throwing an error
  var errors;
  dataset.layers.forEach(function(lyr) {
    if (layerHasPoints(lyr)) {
      projectPointLayer(lyr, proj); // v2 compatible (invalid points are removed)
    }
  });
  if (dataset.arcs) {
    if (opts.densify) {
      errors = projectAndDensifyArcs(dataset.arcs, proj);
    } else {
      errors = projectArcs2(dataset.arcs, proj);
    }
    if (errors > 0) {
      // TODO: implement this (null arcs have zero length)
      // internal.removeShapesWithNullArcs(dataset);
    }
  }
}


// proj: function to project [x, y] point; should return null if projection fails
// TODO: fatal error if no points project?
function projectPointLayer(lyr, proj) {
  editShapes(lyr.shapes, function(p) {
    return proj(p[0], p[1]); // removes points that fail to project
  });
}

function projectArcs(arcs, proj) {
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
}

function projectArcs2(arcs, proj) {
  return editArcs(arcs, onPoint);
  function onPoint(append, x, y, prevX, prevY, i) {
    var p = proj(x, y);
    // TODO: prevent arcs with just one point
    if (p) {
      append(p);
    } else {
      return false; // signal that the arc is invalid (no more points will be projected in this arc)
    }
  }
}

function projectAndDensifyArcs(arcs, proj) {
  var interval = getDefaultDensifyInterval(arcs, proj);
  var p = [0, 0];
  return editArcs(arcs, onPoint);

  function onPoint(append, lng, lat, prevLng, prevLat, i) {
    var prevX = p[0],
        prevY = p[1];
    p = proj(lng, lat);
    if (!p) return false; // signal that current arc contains an error

    // Don't try to densify shorter segments (optimization)
    if (i > 0 && geom.distanceSq(p[0], p[1], prevX, prevY) > interval * interval * 25) {
      densifySegment(prevLng, prevLat, prevX, prevY, lng, lat, p[0], p[1], proj, interval)
        .forEach(append);
    }
    append(p);
  }
}

function getDefaultDensifyInterval(arcs, proj) {
  var xy = getAvgSegment2(arcs),
      bb = arcs.getBounds(),
      a = proj(bb.centerX(), bb.centerY()),
      b = proj(bb.centerX() + xy[0], bb.centerY() + xy[1]);
  return geom.distance2D(a[0], a[1], b[0], b[1]);
}

// Interpolate points into a projected line segment if needed to prevent large
//   deviations from path of original unprojected segment.
// @points (optional) array of accumulated points
function densifySegment(lng0, lat0, x0, y0, lng2, lat2, x2, y2, proj, interval, points) {
  // Find midpoint between two endpoints and project it (assumes longitude does
  // not wrap). TODO Consider bisecting along great circle path -- although this
  // would not be good for boundaries that follow line of constant latitude.
  var lng1 = (lng0 + lng2) / 2,
      lat1 = (lat0 + lat2) / 2,
      p = proj(lng1, lat1),
      distSq;
  if (!p) return; // TODO: consider if this is adequate for handling proj. errors
  distSq = geom.pointSegDistSq2(p[0], p[1], x0, y0, x2, y2); // sq displacement
  points = points || [];
  // Bisect current segment if the projected midpoint deviates from original
  //   segment by more than the @interval parameter.
  //   ... but don't bisect very small segments to prevent infinite recursion
  //   (e.g. if projection function is discontinuous)
  if (distSq > interval * interval * 0.25 && geom.distance2D(lng0, lat0, lng2, lat2) > 0.01) {
    densifySegment(lng0, lat0, x0, y0, lng1, lat1, p[0], p[1], proj, interval, points);
    points.push(p);
    densifySegment(lng1, lat1, p[0], p[1], lng2, lat2, x2, y2, proj, interval, points);
  }
  return points;
}
