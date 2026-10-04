import {
  isColorSchemeName,
  getColorRamp,
  getCategoricalColorScheme,
  getRandomizedCategoricalColorScheme,
  wrapColors,
  isCategoricalColorScheme,
  pickRandomColorScheme,
  pickRandomCategoricalScheme
} from '../color/color-schemes';
import { getValueType } from '../datatable/mapshaper-data-utils';
import { validateColor, parseColor } from '../color/color-utils';
import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import {
  interpolateValuesToClasses,
  getPairInterpolator
} from '../classification/mapshaper-interpolation';
import { getContinuousSideStops } from '../classification/mapshaper-diverging';

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
      return getRandomizedCategoricalColorScheme(n);
    } else {
      colorScheme = pickRandomColorScheme('sequential');
    }
    message('Randomly selected color scheme:', colorScheme);
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
      return getColorRamp(colorScheme, n, opts.stops, opts);
    }
  } else if (opts.colors || opts.values) {
    if (categorical) {
      return getCategoricalValues(opts.colors || opts.values, n, !!opts.colors);
    } else {
      return getInterpolableValues(opts.colors || opts.values, n, opts);
    }
  } else {
    // use numerical class indexes (0, 1, ...) if no values are given
    return getIndexes(n);
  }
}

// The values of the classes of a diverging layout (see getDivergingLayout()):
// colors (or values) are spread over the longer side, and the shorter side
// uses the ones nearest the center, so equal steps from the pivot get
// equally strong colors on both sides. The middle of a scheme or list of
// colors is the center color (an even list interpolates one).
// With opts.continuous, each side has a value per color stop (see
// getDivergingStops()) instead of one per class.
export function getDivergingClassValues(layoutArg, opts) {
  var layout = opts.continuous ? Object.assign({}, layoutArg, {
    below: getContinuousSideStops(layoutArg.below),
    above: getContinuousSideStops(layoutArg.above)
  }) : layoutArg;
  var n = layout.below + layout.above + (layout.neutral ? 1 : 0);
  var colorArg = opts.colors && opts.colors.length == 1 ? opts.colors[0] : null;
  var list = opts.colors || opts.values;
  var colorScheme, values;
  if (opts.stops) stop('stops= is not supported with pivot=');
  if (colorArg == 'random') {
    colorScheme = pickRandomColorScheme('diverging');
    message('Randomly selected color scheme:', colorScheme);
  } else if (isColorSchemeName(colorArg)) {
    colorScheme = colorArg;
  } else if (colorArg && !parseColor(colorArg)) {
    stop('Unrecognized color scheme name:', colorArg);
  } else if (opts.colors) {
    opts.colors.forEach(validateColor);
  }
  if (!colorScheme && !list) {
    values = getIndexes(n);
  } else if (!colorScheme && list.length == n && listFitsLayout(layout, opts)) {
    // one value per class
    values = interpolateValuesToClasses(parseValues(list), n, null, opts);
  } else if (!colorScheme && list.length < 2) {
    stop('Expected a color scheme or a list of two or more values');
  } else if (opts.invert) {
    // the sides trade places
    return getDivergingValues(colorScheme, list, layout.above, layout.below, !!layout.neutral, opts).reverse();
  } else {
    return getDivergingValues(colorScheme, list, layout.below, layout.above, !!layout.neutral, opts);
  }
  return opts.invert ? values.reverse() : values;
}

// A list with one value per class is used as given if its middle value
// falls at the pivot, or if classes= gave the numbers of classes on each side
function listFitsLayout(layout, opts) {
  return layout.below == layout.above ||
    Array.isArray(opts.classes) && opts.classes.length == 2;
}

function getDivergingValues(colorScheme, list, below, above, neutral, opts) {
  var k = Math.max(below, above, 1);
  var full = colorScheme ?
    getColorRamp(colorScheme, k * 2 + 1, null, opts) :
    getDivergingRamp(parseValues(list), k, opts);
  // full: k values below the center value, and k above
  return full.slice(k - below, k)
    .concat(neutral ? [full[k]] : [])
    .concat(full.slice(k + 1, k + 1 + above));
}

// Interpolates each half of a list separately, so the center value stays in
// the middle
function getDivergingRamp(values, k, opts) {
  var mid = Math.floor(values.length / 2);
  var odd = values.length % 2 == 1;
  var center = odd ? values[mid] : getPairInterpolator(values[mid - 1], values[mid], opts)(0.5);
  var lower = values.slice(0, mid).concat([center]);
  var upper = [center].concat(values.slice(odd ? mid + 1 : mid));
  var lowerRamp = interpolateValuesToClasses(lower, k + 1, null, opts);
  var upperRamp = interpolateValuesToClasses(upper, k + 1, null, opts);
  return lowerRamp.concat(upperRamp.slice(1));
}

// A list of colors shorter than the list of categories is repeated, as the
// colors of a color scheme are
function getCategoricalValues(values, n, valuesAreColors) {
  if (valuesAreColors && values.length < n) {
    message('Repeating', values.length, 'colors to match', n, 'categories.');
    values = wrapColors(values, n);
  }
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
  // with one value per class, this only adds vibrance= to colors
  return interpolateValuesToClasses(parseValues(arr), n, opts.stops, opts);
}

// convert strings to numbers if they all parse as numbers
// arr: an array of strings
function parseValues(strings) {
  var values = strings;
  if (strings.every(str => utils.parseNumber(str) !== null)) {
    values = strings.map(function(str) {
      return +str;
    });
  }
  return values;
}

