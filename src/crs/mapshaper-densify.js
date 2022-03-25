import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';
import { editArcs } from '../paths/mapshaper-arc-editor';
import { getAvgSegment2 } from '../paths/mapshaper-path-utils';
import { DatasetEditor } from '../dataset/mapshaper-dataset-editor';
import { error } from '../utils/mapshaper-logging';

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
export function densifyPathByInterval(coords, interval, interpolate) {
  if (findMaxPathInterval(coords) < interval) return coords;
  if (!interpolate) {
    interpolate = getIntervalInterpolator(interval);
  }
  var coords2 = [coords[0]], a, b;
  for (var i=1, n=coords.length; i<n; i++) {
    a = coords[i-1];
    b = coords[i];
    if (geom.distance2D(a[0], a[1], b[0], b[1]) > interval + 1e-4) {
      appendArr(coords2, interpolate(a, b));
    }
    coords2.push(b);
  }
  return coords2;
}

export function getIntervalInterpolator(interval) {
  return function(a, b) {
    var points = [];
    // var rev = a[0] == b[0] ? a[1] > b[1] : a[0] > b[0];
    var dist = geom.distance2D(a[0], a[1], b[0], b[1]);
    var n = Math.round(dist / interval) - 1;
    var dx = (b[0] - a[0]) / (n + 1),
        dy = (b[1] - a[1]) / (n + 1);
    for (var i=1; i<=n; i++) {
      points.push([a[0] + dx * i, a[1] + dy * i]);
    }
    return points;
  };
}


// Interpolate the same points regardless of segment direction
export function densifyAntimeridianSegment(a, b, interval) {
  var y1, y2;
  var coords = [];
  var ascending = a[1] < b[1];
  if (a[0] != b[0]) error('Expected an edge segment');
  if (interval > 0 === false) error('Expected a positive interval');
  if (ascending) {
    y1 = a[1];
    y2 = b[1];
  } else {
    y1 = b[1];
    y2 = a[1];
  }
  var y = Math.floor(y1 / interval) * interval + interval;
  while (y < y2) {
    coords.push([a[0], y]);
    y += interval;
  }
  if (!ascending) coords.reverse();
  return coords;
}

function appendArr(dest, src) {
  for (var i=0; i<src.length; i++) dest.push(src[i]);
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
  var minIntervalSq = interval * interval * 25;
  var p;
  return editArcs(arcs, onPoint);

  function onPoint(append, lng, lat, prevLng, prevLat, i) {
    var pp = p;
    p = proj(lng, lat);
    if (!p) return false; // signal that current arc contains an error

    // Don't try to densify shorter segments (optimization)
    if (i > 0 && geom.distanceSq(p[0], p[1], pp[0], pp[1]) > minIntervalSq) {
      densifySegment(prevLng, prevLat,  pp[0],  pp[1], lng, lat, p[0], p[1], proj, interval)
        .forEach(append);
    }
    append(p);
  }
}

// Use the median of intervals computed by projecting segments.
// We're probing a number of points, because @proj might only be valid in
// a sub-region of the dataset bbox (e.g. +proj=tpers)
function findDensifyInterval(bounds, xy, proj) {
  var steps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  var points = [];
  for (var i=0; i<steps.length; i++) {
    for (var j=0; j<steps.length; j++) {
      points.push([steps[i], steps[j]]);
    }
  }
  var intervals = points.map(function(pos) {
    var x = bounds.xmin + bounds.width() * pos[0];
    var y = bounds.ymin + bounds.height() * pos[1];
    var a = proj(x, y);
    var b = proj(x + xy[0], y + xy[1]);
    return a && b ? geom.distance2D(a[0], a[1], b[0], b[1]) : Infinity;
  }).filter(function(int) {return int < Infinity;});
  return intervals.length > 0 ? utils.findMedian(intervals) : Infinity;
}

// Kludgy way to get a useful interval for densifying a bounding box.
// Uses a fraction of average bbox side length)
// TODO: improve
function findDensifyInterval2(bb, proj) {
  var a = proj(bb.centerX(), bb.centerY()),
      c = proj(bb.centerX(), bb.ymin), // right center
      d = proj(bb.xmax, bb.centerY()); // bottom center
  var interval = a && c && d ? (geom.distance2D(a[0], a[1], c[0], c[1]) +
        geom.distance2D(a[0], a[1], d[0], d[1])) / 5000 : Infinity;
  return interval;
}

// Returns an interval in projected units
function getDefaultDensifyInterval(arcs, proj) {
  var xy = getAvgSegment2(arcs),
      bb = arcs.getBounds(),
      intervalA = findDensifyInterval(bb, xy, proj),
      intervalB = findDensifyInterval2(bb, proj),
      interval = Math.min(intervalA, intervalB);
  if (interval == Infinity) {
    error('Densification error');
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
