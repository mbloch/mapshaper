import { stop, error } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

var UNITS_LOOKUP = {
  m: 'meters',
  meter: 'meters',
  meters: 'meters',
  mi: 'miles',
  mile: 'miles',
  miles: 'miles',
  km: 'kilometers',
  ft: 'feet',
  feet: 'feet'
};

// From pj_units.js in mapshaper-proj
var TO_METERS = {
  meters: 1,
  kilometers: 1000,
  feet: 0.3048, // International Standard Foot
  miles: 1609.344 // International Statute Mile
};

// Return coeff. for converting a distance measure to dataset coordinates
// @paramUnits: units code of distance param, or null if units are not specified
// @crs: Proj.4 CRS object, or null (unknown latlong CRS);
//
export function getIntervalConversionFactor(paramUnits, crs) {
  var fromParam = 0,
      fromCRS = 0,
      k;

  if (crs) {
    if (crs.is_latlong) {
      // calculations on latlong coordinates typically use meters
      fromCRS = 1;
    } else if (crs.to_meter > 0) {
      fromCRS = crs.to_meter;
    } else {
      error('Invalid CRS');
    }
  }
  if (paramUnits) {
    fromParam = TO_METERS[paramUnits];
    if (!fromParam) error('Unknown units:', paramUnits);
  }

  if (fromParam && fromCRS) {
    // known param units, known CRS conversion
    k = fromParam / fromCRS;
  } else if (!fromParam && !fromCRS) {
    // unknown param units, unknown (projected) CRS -- no scaling
    k = 1;
  } else if (fromParam && !fromCRS) {
    // known param units, unknown CRS -- error condition, not convertible
    stop('Unable to convert', paramUnits, 'to unknown coordinates');
  } else if (!fromParam && fromCRS) {
    // unknown param units, known CRS -- assume param in meters (bw compatibility)
    k = 1 / fromCRS;
  }
  return k;
}

// throws an error if measure is non-parsable
export function parseMeasure(m) {
  var o = parseMeasure2(m);
  if (isNaN(o.value)) {
    stop('Invalid parameter:', m);
  }
  return o;
}

// returns NaN value if value is non-parsable
export function parseMeasure2(m) {
  var s = utils.isString(m) ? m : '';
  var match = /(sq|)([a-z]+)(2|)$/i.exec(s); // units rxp
  var o = {};
  if (utils.isNumber(m)) {
    o.value = m;
  } else if (s === '') {
    o.value = NaN;
  } else if (match) {
    o.units = UNITS_LOOKUP[match[2].toLowerCase()];
    o.areal = !!(match[1] || match[3]);
    o.value = Number(s.substring(0, s.length - match[0].length));
    if (!o.units && !isNaN(o.value)) {
      // throw error if string contains a number followed by unrecognized units string
      stop('Unknown units: ' + match[0]);
    }
  } else {
    o.value = Number(s);
  }
  return o;
}

export function convertAreaParam(opt, crs) {
  var o = parseMeasure(opt);
  var k = getIntervalConversionFactor(o.units, crs);
  return o.value * k * k;
}

export function convertDistanceParam(opt, crs) {
  var o = parseMeasure(opt);
  var k = getIntervalConversionFactor(o.units, crs);
  if (o.areal) {
    stop('Expected a distance, received an area:', opt);
  }
  return o.value * k;
}

// Same as convertDistanceParam(), except:
//   in the case of latlong datasets, coordinates are unitless (instead of meters),
//   and parameters with units trigger an error
export function convertIntervalParam(opt, crs) {
  var o = parseMeasure(opt);
  var k = getIntervalConversionFactor(o.units, crs);
  if (o.units && crs && crs.is_latlong) {
    stop('Parameter does not support distance units with latlong datasets');
  }
  if (o.areal) {
    stop('Expected a distance, received an area:', opt);
  }
  return o.value * k;
}

export function convertIntervalPair(opt, crs) {
  var a, b;
  if (!Array.isArray(opt) || opt.length != 2) {
    stop('Expected two distance parameters, received', opt);
  }
  a = parseMeasure(opt[0]);
  b = parseMeasure(opt[1]);
  if (a.units && !b.units || b.units && !a.units) {
    stop('Both parameters should have units:', opt);
  }
  return [convertIntervalParam(opt[0], crs),
          convertIntervalParam(opt[1], crs)];
}

// Accepts a single value or a list of four values. List order is l,b,t,r
export function convertFourSides(opt, crs, bounds) {
  var arr = opt.split(',');
  if (arr.length == 1) {
    arr = [arr[0], arr[0], arr[0], arr[0]];
  } else if (arr.length != 4) {
    stop("Expected a distance parameter or a list of four params");
  }
  return arr.map(function(param, i) {
    var tmp;
    if (param.indexOf('%') > 0) {
      tmp = parseFloat(param) / 100 || 0;
      return tmp * (i == 1 || i == 3 ? bounds.height() : bounds.width());
    }
    return convertIntervalParam(opt, crs);
  });
}

// Convert an area measure to a label in sqkm or sqm
export function getAreaLabel(area, crs) {
  var sqm = crs && crs.to_meter ? area * crs.to_meter * crs.to_meter : area;
  var sqkm = sqm / 1e6;
  return sqkm < 0.01 ? Math.round(sqm) + ' sqm' : sqkm + ' sqkm';
}
