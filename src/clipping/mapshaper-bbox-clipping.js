import { error } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';

// Return an array containing points from a path iterator, clipped to a bounding box
// Currently using this function for clipping styled polygons in the GUI to speed up layer rendering.
// Artifacts along the edges make this unsuitable for clipping datasets
// TODO: support clipping a single-part shape to multiple parts
// TODO: prevent artifacts along edges
export function clipIterByBounds(iter, bounds) {
  var points = [];
  var bbox = getClippingBBox(bounds);
  var xy, xyp, first, isRing;
  while (iter.hasNext()) {
    xy = [iter.x, iter.y];
    addClippedPoint(points, xyp, xy, bbox);
    xyp = xy;
    if (!first) first = xy;
  }
  // detect closed rings
  isRing = pointsAreEqual(first, xy);
  if (isRing && points.length > 0 && !pointsAreEqual(points[0], points[points.length - 1])) {
    // some rings need to be closed
    points.push(points[0].concat());
  }
  if (isRing && points.length < 4 || points.length < 2) {
    // catch defective rings and polylines
    points = [];
  }
  return points;
}

function pointsAreEqual(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

//  2 3 4
//  1 8 5
//  0 7 6
function getPointSector(x, y, bbox) {
  var bl = bbox[0];
  var tr = bbox[2];
  var i;
  if (x > tr[0]) {
    i = y > tr[1] && 4 || y >= bl[1] && 5 || 6; // right col
  } else if (x >= bl[0]) {
    i = y > tr[1] && 3 || y >= bl[1] && 8 || 7; // middle col
  } else {
    i = y > tr[1] && 2 || y >= bl[1] && 1 || 0; // left col
  }
  return i;
}

function isCornerSector(q) {
  return q == 0 || q == 2 || q == 4 || q == 6;
}

function isEdgeSector(q) {
  return q == 1 || q == 3 || q == 5 || q == 7;
}

// Number of CCW turns to normalize
function getSectorRotation(q) {
  return q > 1 && q < 8 ? Math.floor(q / 2) : 0;
}

// i: rotation number
// b: bbox object
function rotateClippingBox(i, bbox) {
  var a = bbox[0],
      b = bbox[1],
      c = bbox[2],
      d = bbox[3];
  if (i === 0) {
    bbox = [a, b, c, d];
  } else if (i == 1) {
    bbox = [b, c, d, a];
  } else if (i == 2) {
    bbox = [c, d, a, b];
  } else if (i == 3) {
    bbox = [d, a, b, c];
  } else error('Invalid rotation number');
  return bbox;
}

// Convert a Bounds object to an array of 4 points designed to be rotated
function getClippingBBox(bounds) {
  return [[bounds.xmin, bounds.ymin],
          [bounds.xmin, bounds.ymax],
          [bounds.xmax, bounds.ymax],
          [bounds.xmax, bounds.ymin]];
}

// i: ccw turns (0-3)
function rotateSector(i, q) {
  return q < 8 && q >= 0 ? (q + 8 - i * 2) % 8 : q;
}

function getCornerBySector(q, bbox) {
  if (isCornerSector(q)) {
    return bbox[q / 2].concat();
  }
  error('Invalid corner sector:', q);
}

function addCornerPoint(points, q, bbox) {
  points.push(getCornerBySector(q, bbox));
}

function projectPointToEdge(p, s1, s2) {
  return s1[0] == s2[0] ? [s1[0], p[1]] : [p[0], s1[1]];
}

function addClippedPoint(points, p1, p2, bbox) {
  var q1 = p1 ? getPointSector(p1[0], p1[1], bbox) : -1;
  var q2 = getPointSector(p2[0], p2[1], bbox);
  var rot;
  // even polylines need to be connected along bbox edges to prevent artifact
  //   segments cutting through the bbox
  // TODO: convert disconnected parts to individual polylines or rings
  var closed = true;

  if (q1 == 8 && q2 == 8) {
    // segment is fully within box
    points.push(p2);

  } else if (q1 == q2) {
    // segment is fully within one outer sector (ignore it)

  } else if (q1 == -1) {
    // p2 is first point in the path
    if (q2 == 8) {
      points.push(p2);
    } else if (closed && isCornerSector(q2)) {
      addCornerPoint(points, q2, bbox);
    }

  } else if (q1 == 8) {
    // segment leaves box
    addSegmentBoundsIntersection(points, p1, p2, bbox);
    if (closed && isCornerSector(q2)) {
      addCornerPoint(points, q2, bbox);
    }

  } else if (q2 == 8) {
    // segment enters box
    addSegmentBoundsIntersection(points, p1, p2, bbox);
    points.push(p2);

  } else {
    // segment travels from one outer sector to another outer sector
    // normalise segment by rotating bbox so that p1 is
    // in the 0 or 1 sector relative to the bbox coordinates, if p1 is in an
    // outer segment
    rot = getSectorRotation(q1);
    bbox = rotateClippingBox(rot, bbox);
    q1 = rotateSector(rot, q1);
    q2 = rotateSector(rot, q2);
    if (q1 == 0) {
      // first point is in a corner sector
      if (q2 === 0 || q2 === 1 || q2 === 7) {
        // move to adjacent side -- no point

      } else if (q2 == 2 || q2 == 6) {
        // move to adjacent corner
        if (closed) addCornerPoint(points, q2, bbox);

      } else if (q2 == 3) {
        // far left edge (intersection or left corner)
        if (!addSegmentBoundsIntersection(points, p1, p2, bbox) && closed) addCornerPoint(points, 2, bbox);

      } else if (q2 == 4) {
        // opposite corner
        if (!addSegmentBoundsIntersection(points, p1, p2, bbox)) {
          // determine if bbox is to the left or right of segment
          if (geom.orient2D(p1[0], p1[1], p2[0], p2[1], bbox[0][0], bbox[0][1]) > 1) {
            // bbox is on the left (seg -> nearest corner is CCW)
            addCornerPoint(points, 6, bbox);
          } else {
            // bbox is on the right
            addCornerPoint(points, 2, bbox);
          }
        }
        if (closed) addCornerPoint(points, q2, bbox);

      } else if (q2 == 5) {
        // far right edge (intersection or right corner)
        if (!addSegmentBoundsIntersection(points, p1, p2, bbox) && closed) addCornerPoint(points, 6, bbox);
      }

    } else if (q1 == 1) {
      // first point is in a side sector
      if (q2 == 2 || q2 === 0) {
        // near left corner, near right corner
        addCornerPoint(points, q2, bbox);

      } else if (q2 == 3) {
        // to left side
        if (!addSegmentBoundsIntersection(points, p1, p2, bbox) && closed) addCornerPoint(points, 2, bbox);

      } else if (q2 == 4) {
        // to far left corner
        if (!addSegmentBoundsIntersection(points, p1, p2, bbox) && closed) addCornerPoint(points, 2, bbox);
        if (closed) addCornerPoint(points, 4, bbox);

      } else if (q2 == 5) {
        // to opposite side
        addSegmentBoundsIntersection(points, p1, p2, bbox);

      } else if (q2 == 6) {
        // to far right corner
        if (!addSegmentBoundsIntersection(points, p1, p2, bbox) && closed) addCornerPoint(points, 0, bbox);
        if (closed) addCornerPoint(points, 6, bbox);

      } else if (q2 == 7) {
        // to right side
        if (!addSegmentBoundsIntersection(points, p1, p2, bbox) && closed) addCornerPoint(points, 0, bbox);
      }

    } else {
      error("Sector error");
    }
  }
}

function addSegmentSegmentIntersection(points, a, b, c, d) {
  var p = geom.segmentIntersection(a[0], a[1], b[0], b[1], c[0], c[1],
        d[0], d[1]);
  if (p) points.push(p);
}

function addSegmentBoundsIntersection(points, a, b, bounds) {
  var hits = [];
  addSegmentSegmentIntersection(hits, a, b, bounds[0], bounds[1]); // first edge
  addSegmentSegmentIntersection(hits, a, b, bounds[0], bounds[3]); // last edge
  addSegmentSegmentIntersection(hits, a, b, bounds[1], bounds[2]);
  addSegmentSegmentIntersection(hits, a, b, bounds[2], bounds[3]);
  if (hits.length > 0 ) {
    points.push.apply(points, hits);
    return true;
  }
  return false;
}