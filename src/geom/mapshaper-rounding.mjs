import { transformPoints } from '../dataset/mapshaper-dataset-utils';
import { error } from '../utils/mapshaper-logging';
import { forEachPoint } from '../points/mapshaper-point-utils';
import utils from '../utils/mapshaper-utils';


export function roundToSignificantDigits(n, d) {
  return +n.toPrecision(d);
}

export function roundToDigits(n, d) {
  return +n.toFixed(d); // string conversion makes this slow
}

// Used in mapshaper-expression-utils.js
// TODO: choose between this and the above function
export function roundToDigits2(n, d) {
  var k = 1;
  if (!n && n !== 0) return n; // don't coerce null to 0
  d = d | 0;
  while (d-- > 0) k *= 10;
  return Math.round(n * k) / k;
}

export function roundToTenths(n) {
  return (Math.round(n * 10)) / 10;
}

// inc: Rounding increment (e.g. 0.001 rounds to thousandths)
export function getRoundingFunction(inc) {
  if (!utils.isNumber(inc) || inc === 0) {
    error("Rounding increment must be a non-zero number.");
  }
  var inv = 1 / inc;
  if (inv > 1) inv = Math.round(inv);
  return function(x) {
    return Math.round(x * inv) / inv;
    // these alternatives show rounding error after JSON.stringify()
    // return Math.round(x / inc) / inv;
    // return Math.round(x / inc) * inc;
    // return Math.round(x * inv) * inc;
  };
}

export function getBoundsPrecisionForDisplay(bbox) {
  var w = Math.abs(bbox[2] - bbox[0]),
      h = Math.abs(bbox[3] - bbox[1]),
      // switched to max bound, based on experience with shift-drag box info
      // range = Math.min(w, h) + 1e-8,
      range = Math.max(w, h) + 1e-8,
      digits = 0;
  while (range < 2000) {
    range *= 10;
    digits++;
  }
  return digits;
}

export function getRoundedCoordString(coords, decimals) {
  return coords.map(function(n) {return n.toFixed(decimals);}).join(',');
}

export function getRoundedCoords(coords, decimals) {
  return getRoundedCoordString(coords, decimals).split(',').map(parseFloat);
}

export function roundPoints(lyr, round) {
  forEachPoint(lyr.shapes, function(p) {
    p[0] = round(p[0]);
    p[1] = round(p[1]);
  });
}

export const fround2 = (function() {
  var arr = new Float32Array(1);
  return function(x) {
    arr[0] = x;
    return arr[0];
  };
})();

// This function rounds towards 0 (i.e. floor). TODO: round properly
// @bits: number of bits to round
// performance: about 3x slower than Math.fround()
export function getBinaryRoundingFunction(bits) {
  // double: sign (1) exponent (11) fraction (52)
  // single: sign (1) exponent (8) fraction (23)
  if ((bits >= 1 && bits <= 32) === false) {
    error('Invalid bits argument:', bits);
  }
  var isLE = require('os').endianness() == 'LE';
  var fp = new Float64Array(1);
  var leastBits = new Uint32Array(fp.buffer, isLE ? 0 : 4, 1);
  var mask = 2 ** 32 - 2 ** bits;  // e.g. bits = 4 -> 0b11110000
  return function(x) {
    fp[0] = x;
    leastBits[0] = leastBits[0] & mask;
    return fp[0];
  };
}

// "round to even" on the 23rd bit of the mantissa
export const fround = Math.fround || fround2;

export function setCoordinatePrecision(dataset, precision) {
  var round = getRoundingFunction(precision);
  // var dissolvePolygon, nodes;
  transformPoints(dataset, function(x, y) {
    return [round(x), round(y)];
  });
  // v0.4.52 removing polygon dissolve - see issue #219
  /*
  if (dataset.arcs) {
    nodes = internal.addIntersectionCuts(dataset);
    dissolvePolygon = internal.getPolygonDissolver(nodes);
  }
  dataset.layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polygon' && dissolvePolygon) {
      // clean each polygon -- use dissolve function to remove spikes
      // TODO: better handling of corrupted polygons
      lyr.shapes = lyr.shapes.map(dissolvePolygon);
    }
  });
  */
  return dataset;
}

