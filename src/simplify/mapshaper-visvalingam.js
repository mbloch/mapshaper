/* @requires mapshaper-common, mapshaper-geom, mapshaper-heap */

var Visvalingam = {};

MapShaper.Heap = Heap; // export Heap for testing

Visvalingam.getArcCalculator = function(metric, is3D) {
  var heap = new Heap(),
      prevBuf = MapShaper.expandoBuffer(Int32Array),
      nextBuf = MapShaper.expandoBuffer(Int32Array);

  // Calculate Visvalingam simplification data for an arc
  // Receives arrays of x- and y- coordinates, optional array of z- coords
  //
  return function calcVisvalingam(kk, xx, yy, zz) {
    var arcLen = kk.length,
        prevArr = prevBuf(arcLen),
        nextArr = nextBuf(arcLen),
        threshold = -Infinity,
        tmp,
        ax, ay, bx, by, cx, cy,
        idx, nextIdx, prevIdx;

    if (zz && !is3D) {
      error("[calcVisvalingam()] Received z-axis data for 2D simplification");
    } else if (!zz && is3D) {
      error("[calcVisvalingam()] Missing z-axis data for 3D simplification");
    }

    // Initialize Visvalingam "effective area" values and references to
    //   prev/next points for each point in arc.
    //
    kk[0] = kk[arcLen-1] = Infinity; // arc endpoints
    for (var i=1; i<arcLen-1; i++) {
      ax = xx[i-1];
      bx = xx[i];
      cx = xx[i+1];
      ay = yy[i-1];
      by = yy[i];
      cy = yy[i+1];

      if (!is3D) {
        tmp = metric(ax, ay, bx, by, cx, cy);
      } else {
        tmp = metric(ax, ay, zz[i-1], bx, by, zz[i], cx, cy, zz[i+1]);
      }
      kk[i] = tmp;
      nextArr[i] = i + 1;
      prevArr[i] = i - 1;
    }
    prevArr[arcLen-1] = arcLen - 2;
    nextArr[0] = 1;
    heap.init(kk);

    // Calculate removal thresholds for each internal point in the arc
    //
    while (heap.heapSize() > 0) {
      idx = heap.pop(); // Remove the point with the least effective area.
      tmp = kk[idx];
      if (tmp === Infinity) {
        break;
      }
      if (tmp >= threshold === false) {
        error("[visvalingam] Values should increase, but:", threshold, tmp);
      }
      threshold = tmp;

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
        if (!is3D) {
          tmp = metric(bx, by, ax, ay, cx, cy); // next point, prev point, prev-prev point
        } else {
          tmp = metric(bx, by, zz[nextIdx], ax, ay, zz[prevIdx], cx, cy, zz[prevArr[prevIdx]]);
        }
        // don't give updated values a lesser value than the last popped vertex
        tmp =  Math.max(threshold, tmp);
        heap.updateValue(prevIdx, tmp);
      }
      if (nextIdx < arcLen-1) {
        cx = xx[nextArr[nextIdx]];
        cy = yy[nextArr[nextIdx]];
        if (!is3D) {
          tmp = metric(ax, ay, bx, by, cx, cy); // prev point, next point, next-next point
        } else {
          tmp = metric(ax, ay, zz[prevIdx], bx, by, zz[nextIdx], cx, cy, zz[nextArr[nextIdx]]);
        }
        tmp = Math.max(threshold, tmp);
        heap.updateValue(nextIdx, tmp);
      }
      nextArr[prevIdx] = nextIdx;
      prevArr[nextIdx] = prevIdx;
    }

    // convert area metric to a linear equivalent
    for (var j=1; j<arcLen-1; j++) {
      kk[j] = Math.sqrt(kk[j]) * 0.65;
    }
  };
};

Visvalingam.standardMetric = triangleArea;
Visvalingam.standardMetric3D = triangleArea3D;

Visvalingam.weightedMetric = function(ax, ay, bx, by, cx, cy) {
  var area = triangleArea(ax, ay, bx, by, cx, cy),
      cos = cosine(ax, ay, bx, by, cx, cy);
  return Visvalingam.weight(cos) * area;
};

Visvalingam.weightedMetric3D = function(ax, ay, az, bx, by, bz, cx, cy, cz) {
  var area = triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz),
      cos = cosine3D(ax, ay, az, bx, by, bz, cx, cy, cz);
  return Visvalingam.weight(cos) * area;
};

// Functions for weighting triangle area

// The original Flash-based Mapshaper (ca. 2006) used a step function to
// underweight more acute triangles.
Visvalingam.weight_v1 = function(cos) {
  var angle = Math.acos(cos),
      weight = 1;
  if (angle < 0.5) {
    weight = 0.1;
  } else if (angle < 1) {
    weight = 0.3;
  }
  return weight;
};

// v2 weighting: underweight polyline vertices at acute angles in proportion to 1 - cosine
Visvalingam.weight_v2 = function(cos) {
  return cos > 0 ? 1 - cos : 1;
};

// v3 weighting: weight by inverse cosine
// Standard weighting favors 90-deg angles; this curve peaks at 120 deg.
Visvalingam.weight_v3 = function(cos) {
  var k = 0.7;
  return -cos * k + 1;
};

Visvalingam.weight = Visvalingam.weight_v3;

Visvalingam.getPathSimplifier = function(name, use3D) {
  var metric = (use3D ? Visvalingam.metrics3D : Visvalingam.metrics2D)[name];
  if (!metric) {
    error("[visvalingam] Unknown metric:", name);
  }
  return Visvalingam.getArcCalculator(metric, use3D);
};

Visvalingam.metrics2D = {
  visvalingam: Visvalingam.standardMetric,
  mapshaper_v1: Visvalingam.weightedMetric_v1,
  mapshaper: Visvalingam.weightedMetric
};

Visvalingam.metrics3D = {
  visvalingam: Visvalingam.standardMetric3D,
  mapshaper_v1: Visvalingam.weightedMetric3D_v1,
  mapshaper: Visvalingam.weightedMetric3D
};
