/* @requires mapshaper-common, mapshaper-geom, mapshaper-heap */

var Visvalingam = {};

MapShaper.Heap = Heap; // export Heap for testing

Visvalingam.getArcCalculator = function(metric2D, metric3D, scale) {
  var bufLen = 0,
      heap = new Heap(),
      prevArr, nextArr;

  // Calculate Visvalingam simplification data for an arc
  // Receives arrays of x- and y- coordinates, optional array of z- coords
  //
  return function calcVisvalingam(dest, xx, yy, zz) {
    var arcLen = dest.length,
        useZ = !!zz,
        threshold,
        ax, ay, bx, by, cx, cy;

    if (arcLen > bufLen) {
      bufLen = Math.round(arcLen * 1.2);
      prevArr = new Int32Array(bufLen);
      nextArr = new Int32Array(bufLen);
    }

    // Initialize Visvalingam "effective area" values and references to
    //   prev/next points for each point in arc.
    //
    for (var i=1; i<arcLen-1; i++) {
      ax = xx[i-1];
      ay = yy[i-1];
      bx = xx[i];
      by = yy[i];
      cx = xx[i+1];
      cy = yy[i+1];

      if (!useZ) {
        threshold = metric2D(ax, ay, bx, by, cx, cy);
      } else {
        threshold = metric3D(ax, ay, zz[i-1], bx, by, zz[i], cx, cy, zz[i+1]);
      }

      dest[i] = threshold;
      nextArr[i] = i + 1;
      prevArr[i] = i - 1;
    }
    prevArr[arcLen-1] = arcLen - 2;
    nextArr[0] = 1;

    // Initialize the heap with thresholds; don't add first and last point
    heap.addValues(dest, 1, arcLen-2);

    // Calculate removal thresholds for each internal point in the arc
    //
    var idx, nextIdx, prevIdx;
    while(heap.heapSize() > 0) {

      // Remove the point with the least effective area.
      idx = heap.pop();
      if (idx < 1 || idx > arcLen - 2) {
        error("Popped first or last arc vertex (error condition); idx:", idx, "len:", arcLen);
      }

      // Recompute effective area of neighbors of the removed point.
      prevIdx = prevArr[idx];
      nextIdx = nextArr[idx];
      ax = xx[prevIdx];
      ay = yy[prevIdx];
      bx = xx[nextIdx];
      by = yy[nextIdx];

      if (prevIdx > 0) {
        cx = xx[prevArr[prevIdx]];
        cy = yy[prevArr[prevIdx]];
        if (!useZ) {
          threshold = metric2D(bx, by, ax, ay, cx, cy); // next point, prev point, prev-prev point
        } else {
          threshold = metric3D(bx, by, zz[nextIdx], ax, ay, zz[prevIdx], cx, cy, zz[prevArr[prevIdx]]);
        }
        heap.updateValue(prevIdx, threshold);
      }
      if (nextIdx < arcLen-1) {
        cx = xx[nextArr[nextIdx]];
        cy = yy[nextArr[nextIdx]];
        if (!useZ) {
          threshold = metric2D(ax, ay, bx, by, cx, cy); // prev point, next point, next-next point
        } else {
          threshold = metric3D(ax, ay, zz[prevIdx], bx, by, zz[nextIdx], cx, cy, zz[nextArr[nextIdx]]);
        }
        heap.updateValue(nextIdx, threshold);
      }
      nextArr[prevIdx] = nextIdx;
      prevArr[nextIdx] = prevIdx;
    }

    // convert area metric to a linear equivalent
    //
    for (var j=1; j<arcLen-1; j++) {
      dest[j] = Math.sqrt(dest[j]) * (scale || 1);
    }
    dest[0] = dest[arcLen-1] = Infinity; // arc endpoints
  };
};

Visvalingam.standardMetric = triangleArea;
Visvalingam.standardMetric3D = triangleArea3D;

// Replacement for original "Modified Visvalingam"
// Underweight polyline vertices with acute angles in proportion to 1 - cosine
//
Visvalingam.specialMetric = function(ax, ay, bx, by, cx, cy) {
  var area = triangleArea(ax, ay, bx, by, cx, cy),
      dotp = dotProduct(ax, ay, bx, by, cx, cy),
      weight = dotp > 0 ? 1 - dotp : 1;
  return area * weight;
};

Visvalingam.specialMetric3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      dotp = dotProduct3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      weight = dotp > 0 ? 1 - dotp : 1;
  return area * weight;
};

// The original "modified Visvalingam" function uses a step function to
// underweight more acute triangles.
//
Visvalingam.specialMetric_v1 = function(ax, ay, bx, by, cx, cy) {
  var area = triangleArea(ax, ay, bx, by, cx, cy),
      angle = innerAngle(ax, ay, bx, by, cx, cy),
      weight = angle < 0.5 ? 0.1 : angle < 1 ? 0.3 : 1;
  return area * weight;
};

Visvalingam.specialMetric3D_v1 = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      angle = innerAngle3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      weight = angle < 0.5 ? 0.1 : angle < 1 ? 0.3 : 1;
  return area * weight;
};
