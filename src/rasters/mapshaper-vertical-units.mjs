// The units of a raster's sample values, for rasters that hold elevations.
// A grid records them as grid.verticalUnits: one of the names below, or the
// text a file gave for a unit mapshaper does not recognize. A grid without
// verticalUnits is in unknown units, which elevation commands take for meters.

var UNITS = {
  m: {meters: 1, label: 'm', gdal: 'm'},
  cm: {meters: 0.01, label: 'cm', gdal: 'cm'},
  mm: {meters: 0.001, label: 'mm', gdal: 'mm'},
  km: {meters: 1000, label: 'km', gdal: 'km'},
  ft: {meters: 0.3048, label: 'ft', gdal: 'ft'},
  'us-ft': {meters: 1200 / 3937, label: 'US survey ft', gdal: 'US survey foot'}
};

var ALIASES = {
  m: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm',
  cm: 'cm', centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm',
  mm: 'mm', millimeter: 'mm', millimeters: 'mm', millimetre: 'mm', millimetres: 'mm',
  km: 'km', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km',
  ft: 'ft', foot: 'ft', feet: 'ft', 'international foot': 'ft', 'intl foot': 'ft',
  'us-ft': 'us-ft', 'us ft': 'us-ft', ftus: 'us-ft', 'ft-us': 'us-ft', 'us foot': 'us-ft',
  'us survey foot': 'us-ft', 'us survey feet': 'us-ft', 'us_survey_foot': 'us-ft',
  'us survey ft': 'us-ft', 'foot_us': 'us-ft'
};

// Returns the name of a unit given as text (e.g. GDAL's UNITTYPE), the text
// itself if it names a unit mapshaper does not know, or null if it is empty
export function parseVerticalUnits(str) {
  var key = String(str == null ? '' : str).trim();
  if (!key) return null;
  return ALIASES[key.toLowerCase().replace(/\s+/g, ' ')] || key;
}

// Returns the unit whose length in meters is @meters, or null
export function getVerticalUnitsFromMeters(meters) {
  var name;
  if (!(meters > 0)) return null;
  for (name in UNITS) {
    if (Math.abs(UNITS[name].meters / meters - 1) < 1e-6) return name;
  }
  return null;
}

export function verticalUnitsAreKnown(units) {
  return !!units && units in UNITS;
}

// Meters per unit, or null if @units is missing or not recognized
export function getVerticalUnitMeters(units) {
  return verticalUnitsAreKnown(units) ? UNITS[units].meters : null;
}

export function formatVerticalUnits(units) {
  return verticalUnitsAreKnown(units) ? UNITS[units].label : String(units || '');
}

// The UNITTYPE text GDAL uses for @units
export function getGdalUnitType(units) {
  return verticalUnitsAreKnown(units) ? UNITS[units].gdal : String(units || '');
}
