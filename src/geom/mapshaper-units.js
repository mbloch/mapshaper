/* @requires mapshaper-projections */

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
internal.getIntervalConversionFactor = function(paramUnits, crs) {
  var fromParam = 0,
      fromCRS = 0,
      k;

  if (crs) {
    // calculations on latlong coordinates use meters
    fromCRS = crs.is_latlong ? 1 : crs.to_meter;
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
};

internal.parseMeasure = function(s) {
  var match = /(sq|)([a-z]+)(2|)$/i.exec(s);
  var o = {};
  if (match) {
    o.units = UNITS_LOOKUP[match[2].toLowerCase()];
    if (!o.units) {
      error('Unknown units:', match[0]);
    }
    o.areal = !!(match[1] || match[3]);
    o.value = Number(s.substring(0, s.length - match[0].length));
  } else {
    o.value = Number(s);
  }
  if (isNaN(o.value) || !s.length) {
    error('Invalid parameter:', s);
  }
  return o;
};

internal.convertAreaParam = function(opt, dataset) {
  var o = internal.parseMeasure(opt);
  var k = internal.getIntervalConversionFactor(o.units, internal.getDatasetCRS(dataset));
  return o.value * k * k;
};

internal.convertDistanceParam = function(opt, dataset) {
  var o = internal.parseMeasure(opt);
  var k = internal.getIntervalConversionFactor(o.units, internal.getDatasetCRS(dataset));
  if (o.areal) {
    error('Expected a distance, received an area:', s);
  }
  return o.value * k;
};
