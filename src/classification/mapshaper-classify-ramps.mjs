import { isColorSchemeName, getColorRamp, getCategoricalColorScheme, isCategoricalColorScheme, pickRandomColorScheme, getRandomColors } from '../color/color-schemes';
import { getValueType } from '../datatable/mapshaper-data-utils';
import { validateColor, parseColor } from '../color/color-utils';
import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import {
  interpolateValuesToClasses
} from '../classification/mapshaper-interpolation';

export function getNullValue(opts) {
  var nullValue;
  if ('null_value' in opts) {
    nullValue = parseNullValue(opts.null_value);
  } else if (opts.colors) {
    nullValue = '#eee';
  } else if (opts.values) {
    nullValue = null;
  } else {
    nullValue = -1; // kludge, to match behavior of getClassValues()
  }
  return nullValue;
}

// Parse command line string arguments to the correct data type
function parseNullValue(val) {
  if (utils.isString(val) && !isNaN(+val)) {
    val = +val;
  }
  if (val === 'null') {
    val = null;
  }
  return val;
}

export function getClassValues(method, n, opts) {
  var categorical = method == 'categorical' || method == 'non-adjacent';
  var colorArg = opts.colors && opts.colors.length == 1 ? opts.colors[0] : null;
  var colorScheme;

  if (method == 'blacki') return [];

  if (colorArg == 'random') {
    if (categorical) {
      return getRandomColors(n);
    }
    colorScheme = pickRandomColorScheme('sequential');
    message('Randomly selected color ramp:', colorScheme);
  } else if (isColorSchemeName(colorArg)) {
    colorScheme = colorArg;
  } else if (colorArg && !parseColor(colorArg)) {
    stop('Unrecognized color scheme name:', colorArg);
  } else if (opts.colors) {
    opts.colors.forEach(validateColor);
  }

  if (colorScheme) {
    if (categorical && isCategoricalColorScheme(colorScheme)) {
      return getCategoricalColorScheme(colorScheme, n);
    } else {
      return getColorRamp(colorScheme, n, opts.stops);
    }
  } else if (opts.colors || opts.values) {
    if (categorical) {
      return getCategoricalValues(opts.colors || opts.values, n);
    } else {
      return getInterpolableValues(opts.colors || opts.values, n, opts);
    }
  } else {
    // use numerical class indexes (0, 1, ...) if no values are given
    return getIndexes(n);
  }
}

function getCategoricalValues(values, n) {
  if (n != values.length) {
    stop('Mismatch in number of categories and number of values');
  }
  return parseValues(values); // convert numerical strings to numbers
}

function getIndexes(n) {
  var vals = [];
  for (var i=0; i<n; i++) {
    vals.push(i);
  }
  return vals;
}

// TODO: check for non-interpolatable value types (e.g. boolean, text)
function getInterpolableValues(arr, n, opts) {
  var values = parseValues(arr);
  if (n != values.length || opts.stops) {
    return interpolateValuesToClasses(values, n, opts.stops);
  }
  return values;
}

// convert strings to numbers if they all parse as numbers
// arr: an array of strings
function parseValues(strings) {
  var values = strings;
  if (strings.every(utils.parseNumber)) {
    values = strings.map(function(str) {
      return +str;
    });
  }
  return values;
}

