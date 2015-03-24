/* @requires mapshaper-common, mapshaper-geom, mapshaper-heap */

var Visvalingam = {};

MapShaper.Heap = Heap; // export Heap for testing

Visvalingam.getArcCalculator = function(metric, is3D) {
  var heap = new Heap(),
      prevBuf = MapShaper.expandoBuffer(Int32Array),
      nextBuf = MapShaper.expandoBuffer(Int32Array);

  // Calculate Visvalingam simplification data for an arc
  // @kk (Float64Array|Array) Receives calculated thresholds
  // @xx, @yy, (@zz) Buffers containing vertex coordinates
  return function calcVisvalingam(kk, xx, yy, zz) {
    var arcLen = kk.length,
        prevArr = prevBuf(arcLen),
        nextArr = nextBuf(arcLen),
        threshold = -Infinity,
        tmp, a, b, c, d, e;

    if (zz && !is3D) {
      error("[visvalingam] Received z-axis data for 2D simplification");
    } else if (!zz && is3D) {
      error("[visvalingam] Missing z-axis data for 3D simplification");
    } else if (kk.length > xx.length) {
      error("[visvalingam] Incompatible data arrays:", kk.length, xx.length);
    }

    // Initialize Visvalingam "effective area" values and references to
    //   prev/next points for each point in arc.
    for (c=0; c<arcLen; c++) {
      b = c-1;
      d = c+1;
      if (b < 0 || d >= arcLen) {
        tmp = Infinity; // endpoint thresholds
      } else if (!is3D) {
        tmp = metric(xx[b], yy[b], xx[c], yy[c], xx[d], yy[d]);
      } else {
        tmp = metric(xx[b], yy[b], zz[b], xx[c], yy[c], zz[c], xx[d], yy[d], zz[d]);
      }
      kk[c] = tmp;
      nextArr[c] = d;
      prevArr[c] = b;
    }
    heap.init(kk);

    // Calculate removal thresholds for each internal point in the arc
    //
    while (heap.heapSize() > 0) {
      c = heap.pop(); // Remove the point with the least effective area.
      tmp = kk[c];
      if (tmp === Infinity) {
        break;
      }
      if (tmp >= threshold === false) {
        error("[visvalingam] Values should increase, but:", threshold, tmp);
      }
      threshold = tmp;

      // Recompute effective area of neighbors of the removed point.
      b = prevArr[c];
      d = nextArr[c];

      if (b > 0) {
        a = prevArr[b];
        if (!is3D) {
          tmp = metric(xx[a], yy[a], xx[b], yy[b], xx[d], yy[d]); // next point, prev point, prev-prev point
        } else {
          tmp = metric(xx[a], yy[a], zz[a], xx[b], yy[b], zz[b], xx[d], yy[d], zz[d]);
        }
        // don't give updated values a lesser value than the last popped vertex
        tmp =  Math.max(threshold, tmp);
        heap.updateValue(b, tmp);
      }
      if (d < arcLen-1) {
        e = nextArr[d];
        if (!is3D) {
          tmp = metric(xx[b], yy[b], xx[d], yy[d], xx[e], yy[e]); // prev point, next point, next-next point
        } else {
          tmp = metric(xx[b], yy[b], zz[b], xx[d], yy[d], zz[d], xx[e], yy[e], zz[e]);
        }
        tmp = Math.max(threshold, tmp);
        heap.updateValue(d, tmp);
      }
      nextArr[b] = d;
      prevArr[d] = b;
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
