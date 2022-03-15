import { isColorSchemeName, getColorRamp, getCategoricalColorScheme, isCategoricalColorScheme } from '../color/color-schemes';
import { parseColor } from '../color/color-utils';
import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import {
  interpolateValuesToClasses
} from '../classification/mapshaper-interpolation';

export function getClassValues(method, n, opts) {
  var categorical = method == 'categorical' || method == 'non-adjacent';
  var colorArg = opts.colors ? opts.colors[0] : null;
  var colorScheme;

  if (isColorSchemeName(colorArg)) {
    colorScheme = colorArg;
  } else if (colorArg == 'random') {
    colorScheme = categorical ? 'Tableau20' : 'BuGn'; // TODO: randomize
  } else if (opts.colors) {
    // validate colors
    opts.colors.forEach(parseColor);
  }

  if (categorical) {
    if (colorScheme && isCategoricalColorScheme(colorScheme)) {
      return getCategoricalColorScheme(colorScheme, n);
    } else if (colorScheme) {
      // assume we have a sequential ramp
      return getColorRamp(colorScheme, n, opts.stops);
    } else if (opts.colors || opts.values) {
      return getCategoricalValues(opts.colors || opts.values, n);
    } else {
      // numerical indexes seem to make sense for non-adjacent and categorical colors
      return getIndexes(n);
    }
  } else {
    // sequential values
    if (colorScheme) {
      return getColorRamp(colorScheme, n, opts.stops);
    } else if (opts.colors || opts.values) {
      return getInterpolableValues(opts.colors || opts.values, n, opts);
    } else {
      // TODO: rethink this
      // return getInterpolableValues([0, 1], n, opts);
      return getIndexes(n);
    }
  }
}


function getCategoricalValues(values, n) {
  if (n != values.length) {
    stop('Mismatch in number of categories and number of values');
  }
  return values;
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

