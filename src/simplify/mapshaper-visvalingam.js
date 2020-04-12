import { Heap } from '../simplify/mapshaper-heap';
import { error } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';

var Visvalingam = {};
export default Visvalingam;

Visvalingam.getArcCalculator = function(metric, is3D) {
  var heap = new Heap(),
      prevBuf = utils.expandoBuffer(Int32Array),
      nextBuf = utils.expandoBuffer(Int32Array),
      calc = is3D ?
        function(b, c, d, xx, yy, zz) {
          return metric(xx[b], yy[b], zz[b], xx[c], yy[c], zz[c], xx[d], yy[d], zz[d]);
        } :
        function(b, c, d, xx, yy) {
          return metric(xx[b], yy[b], xx[c], yy[c], xx[d], yy[d]);
        };

  // Calculate Visvalingam simplification data for an arc
  // @kk (Float64Array|Array) Receives calculated simplification thresholds
  // @xx, @yy, (@zz) Buffers containing vertex coordinates
  return function calcVisvalingam(kk, xx, yy, zz) {
    var arcLen = kk.length,
        prevArr = prevBuf(arcLen),
        nextArr = nextBuf(arcLen),
        val, maxVal = -Infinity,
        b, c, d; // indexes of points along arc

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
        val = Infinity; // endpoint maxVals
      } else {
        val = calc(b, c, d, xx, yy, zz);
      }
      kk[c] = val;
      nextArr[c] = d;
      prevArr[c] = b;
    }
    heap.init(kk);

    // Calculate removal thresholds for each internal point in the arc
    //
    while (heap.size() > 0) {
      c = heap.pop(); // Remove the point with the least effective area.
      val = kk[c];
      if (val === Infinity) {
        break;
      }
      if (val < maxVal) {
        // don't assign current point a lesser value than the last removed vertex
        kk[c] = maxVal;
      } else {
        maxVal = val;
      }

      // Recompute effective area of neighbors of the removed point.
      b = prevArr[c];
      d = nextArr[c];
      if (b > 0) {
        val = calc(prevArr[b], b, d, xx, yy, zz);
        heap.updateValue(b, val);
      }
      if (d < arcLen-1) {
        val = calc(b, d, nextArr[d], xx, yy, zz);
        heap.updateValue(d, val);
      }
      nextArr[b] = d;
      prevArr[d] = b;
    }
  };
};

Visvalingam.standardMetric = geom.triangleArea;
Visvalingam.standardMetric3D = geom.triangleArea3D;

Visvalingam.getWeightedMetric = function(opts) {
  var weight = Visvalingam.getWeightFunction(opts);
  return function(ax, ay, bx, by, cx, cy) {
    var area = geom.triangleArea(ax, ay, bx, by, cx, cy),
        cos = geom.cosine(ax, ay, bx, by, cx, cy);
    return weight(cos) * area;
  };
};

Visvalingam.getWeightedMetric3D = function(opts) {
  var weight = Visvalingam.getWeightFunction(opts);
  return function(ax, ay, az, bx, by, bz, cx, cy, cz) {
    var area = geom.triangleArea3D(ax, ay, az, bx, by, bz, cx, cy, cz),
        cos = geom.cosine3D(ax, ay, az, bx, by, bz, cx, cy, cz);
    return weight(cos) * area;
  };
};

Visvalingam.getWeightCoefficient = function(opts) {
  return opts && utils.isNumber(opts && opts.weighting) ? opts.weighting : 0.7;
};

// Get a parameterized version of Visvalingam.weight()
Visvalingam.getWeightFunction = function(opts) {
  var k = Visvalingam.getWeightCoefficient(opts);
  return function(cos) {
    return -cos * k + 1;
  };
};

// Weight triangle area by inverse cosine
// Standard weighting favors 90-deg angles; this curve peaks at 120 deg.
Visvalingam.weight = function(cos) {
  var k = 0.7;
  return -cos * k + 1;
};

Visvalingam.getEffectiveAreaSimplifier = function(use3D) {
  var metric = use3D ? Visvalingam.standardMetric3D : Visvalingam.standardMetric;
  return Visvalingam.getPathSimplifier(metric, use3D);
};

Visvalingam.getWeightedSimplifier = function(opts, use3D) {
  var metric = use3D ? Visvalingam.getWeightedMetric3D(opts) : Visvalingam.getWeightedMetric(opts);
  return Visvalingam.getPathSimplifier(metric, use3D);
};

Visvalingam.getPathSimplifier = function(metric, use3D) {
  return Visvalingam.scaledSimplify(Visvalingam.getArcCalculator(metric, use3D));
};


Visvalingam.scaledSimplify = function(f) {
  return function(kk, xx, yy, zz) {
    f(kk, xx, yy, zz);
    for (var i=1, n=kk.length - 1; i<n; i++) {
      // convert area metric to a linear equivalent
      kk[i] = Math.sqrt(kk[i]) * 0.65;
    }
  };
};
