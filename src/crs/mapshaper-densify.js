import geom from '../geom/mapshaper-geom';
import { editArcs } from '../paths/mapshaper-arc-editor';
import { getAvgSegment2 } from '../paths/mapshaper-path-utils';

export function projectAndDensifyArcs(arcs, proj) {
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
      b = proj(bb.centerX() + xy[0], bb.centerY() + xy[1]),
      c = proj(bb.centerX(), bb.ymin), // right center
      d = proj(bb.xmax, bb.centerY()), // bottom center
      // interval A: based on average segment length
      intervalA = geom.distance2D(a[0], a[1], b[0], b[1]),
      // interval B: a fraction of avg bbox side length
      // (added this for bbox densification)
      intervalB = (geom.distance2D(a[0], a[1], c[0], c[1]) +
        geom.distance2D(a[0], a[1], d[0], d[1])) / 5000;
  return Math.min(intervalA, intervalB);
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
