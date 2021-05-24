import geom from '../geom/mapshaper-geom';
import { editArcs } from '../paths/mapshaper-arc-editor';
import { getAvgSegment2 } from '../paths/mapshaper-path-utils';
import { stop, error } from '../utils/mapshaper-logging';
import { DatasetEditor } from '../dataset/mapshaper-dataset-editor';

export function densifyDataset(dataset, opts) {
  var interval = opts.interval;
  if (interval > 0 === false) {
    error('Expected a valid interval parameter');
  }
  var editor = new DatasetEditor(dataset);
  dataset.layers.forEach(function(lyr) {
    var type = lyr.geometry_type;
    editor.editLayer(lyr, function(coords, i, shape) {
      if (type == 'point') return coords;
      return [densifyPathByInterval(coords, interval)];
    });
  });
  editor.done();
}


// Planar densification by an interval
export function densifyPathByInterval(coords, interval, filter) {
  if (findMaxPathInterval(coords) < interval) return coords;
  var coords2 = [coords[0]], a, b, dist;
  for (var i=1, n=coords.length; i<n; i++) {
    a = coords[i-1];
    b = coords[i];
    dist = geom.distance2D(a[0], a[1], b[0], b[1]);
    if (dist > interval && (!filter || filter(a, b))) {
      pushInterpolatedPoints(coords2, a, b, Math.round(dist / interval) - 1);
    }
    coords2.push(b);
  }
  return coords2;
}

function pushInterpolatedPoints(coords2, a, b, n) {
  var dx = (b[0] - a[0]) / (n + 1),
      dy = (b[1] - a[1]) / (n + 1);
  for (var i=1; i<=n; i++) {
    coords2.push([a[0] + dx * i, a[1] + dy * i]);
  }
}

function findMaxPathInterval(coords) {
  var maxSq = 0, intSq, a, b;
  for (var i=1, n=coords.length; i<n; i++) {
    a = coords[i-1];
    b = coords[i];
    intSq = geom.distanceSq(a[0], a[1], b[0], b[1]);
    if (intSq > maxSq) maxSq = intSq;
  }
  return Math.sqrt(maxSq);
}

export function densifyUnprojectedPathByDistance(coords, meters) {
  // stub
}

export function projectAndDensifyArcs(arcs, proj) {
  var interval = getDefaultDensifyInterval(arcs, proj);
  var p;
  return editArcs(arcs, onPoint);

  function onPoint(append, lng, lat, prevLng, prevLat, i) {
    var pp = p;
    p = proj(lng, lat);
    if (!p) return false; // signal that current arc contains an error

    // Don't try to densify shorter segments (optimization)
    if (i > 0 && geom.distanceSq(p[0], p[1], pp[0], pp[1]) > interval * interval * 25) {
      densifySegment(prevLng, prevLat,  pp[0],  pp[1], lng, lat, p[0], p[1], proj, interval)
        .forEach(append);
    }
    append(p);
  }
}

function getDefaultDensifyInterval(arcs, proj) {
  var xy = getAvgSegment2(arcs),
      bb = arcs.getBounds(),
      a = proj(bb.centerX(), bb.centerY()),
      b = proj(bb.centerX() + xy[0], bb.centerY() + xy[1]),
      c = proj(bb.centerX(), bb.ymin), // right center
      d = proj(bb.xmax, bb.centerY()); // bottom center
  // interval A: based on average segment length
  var intervalA = a && b ? geom.distance2D(a[0], a[1], b[0], b[1]) : Infinity;
  // interval B: a fraction of avg bbox side length
  // (added this for bbox densification)
  var intervalB = c && d ? (geom.distance2D(a[0], a[1], c[0], c[1]) +
        geom.distance2D(a[0], a[1], d[0], d[1])) / 5000 : Infinity;
  var interval = Math.min(intervalA, intervalB);
  if (interval == Infinity) {
    stop('Projection failure');
  }
  return interval;
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
