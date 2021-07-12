import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import { getFieldValues } from '../datatable/mapshaper-data-utils';
import { isColorSchemeName, getColorRamp, getCategoricalColorScheme } from '../color/color-schemes';
import { parseColor } from '../color/color-utils';
import {
  getSequentialClassifier,
} from '../classification/mapshaper-sequential-classifier';
import {
  getCategoricalClassifier
} from '../classification/mapshaper-categorical-classifier';
import {
  getIndexedClassifier,
  validateClassIndexField
} from '../classification/mapshaper-indexed-classifier';
import {
  interpolateValuesToClasses
} from '../classification/mapshaper-interpolation';
import cmd from '../mapshaper-cmd';
import { getUniqFieldValues } from '../datatable/mapshaper-data-utils';

cmd.classify = function(lyr, optsArg) {
  var opts = optsArg || {};
  var records = lyr.data && lyr.data.getRecords();
  var nullValue = opts.null_value || null;
  var looksLikeColors = !!opts.colors || !!opts.color_scheme;
  var colorScheme;
  var classValues, classify;
  var numBuckets, numValues;
  var dataField, outputField;

  // validate explicitly set classes
  if (opts.classes) {
    if (!utils.isInteger(opts.classes) || opts.classes > 1 === false) {
      stop('Invalid classes= value:', opts.classes);
    }
    numBuckets = opts.classes;
  }


  // TODO: better validation of breaks values
  if (opts.breaks) {
    numBuckets = opts.breaks.length + 1;
  }

  if (opts.index_field) {
    dataField = opts.index_field;
    if (numBuckets > 0 === false) {
      stop('The index-field= option requires the classes= option to be set');
    }
    // You can't infer the number of classes by looking at index values;
    // this can cause unwanted interpolation if one or more values are
    // not present in the index field
    // numBuckets = validateClassIndexField(records, opts.index_field);

  } else if (opts.field) {
    dataField = opts.field;

  } else {
    stop('Missing a data field to classify');
  }

  // expand categories if value is '*'
  if (dataField && opts.categories && opts.categories.includes('*')) {
    opts.categories = getUniqFieldValues(records, dataField);
  }

  requireDataField(lyr.data, dataField);

  if (numBuckets) {
    numValues = opts.continuous ? numBuckets + 1 : numBuckets;
  }

  // support both deprecated color-scheme= option and colors=<color-scheme> syntax
  if (opts.color_scheme) {
    if (!isColorSchemeName(opts.color_scheme)) {
      stop('Unknown color scheme:', opts.color_scheme);
    }
    colorScheme = opts.color_scheme;
  } else if (opts.colors && isColorSchemeName(opts.colors[0])) {
    colorScheme = opts.colors[0];
  } else if (opts.colors) {
    opts.colors.forEach(parseColor); // validate colors -- error if unparsable
  }

  if (colorScheme) {
    // using a named color scheme: generate a ramp

    if (opts.categories) {
      classValues = getCategoricalColorScheme(colorScheme, opts.categories.length);
      numBuckets = numValues = classValues.length;
    } else {
      if (!numBuckets) {
        // stop('color-scheme= option requires classes= or breaks=');
        numBuckets = 4; // use a default number of classes
        numValues = opts.continuous ? numBuckets + 1 : numBuckets;
      }
      classValues = getColorRamp(colorScheme, numValues, opts.stops);
    }

  } else if (opts.colors || opts.values) {
    classValues = opts.values ? parseValues(opts.values) : opts.colors;
    if (!numValues) {
      numValues = classValues.length;
    }
    if ((classValues.length != numValues || opts.stops) && numValues > 1) {
      // TODO: handle numValues == 1
      // TODO: check for non-interpolatable value types (e.g. boolean, text)
      classValues = interpolateValuesToClasses(classValues, numValues, opts.stops);
    }

  } else if (numValues > 1) {
    // no values were given: assign indexes for each class
    classValues = getIndexValues(numValues);
    nullValue = -1;
  }

  if (looksLikeColors) {
    nullValue = nullValue || '#eee';
  }

  if (numValues > 1 === false) {
    stop('Missing a valid number of classes');
  }

  if (opts.invert) {
    classValues = classValues.concat().reverse();
  }

  if (looksLikeColors) {
    message('Colors:', formatValuesForLogging(classValues));
  }

  // get a function to convert input data to class indexes
  //
  if (opts.index_field) {
    // data is pre-classified... just read the index from a field
    classify = getIndexedClassifier(classValues, nullValue, opts);
  } else if (opts.categories) {
    classify = getCategoricalClassifier(classValues, nullValue, opts);
  } else {
    classify = getSequentialClassifier(classValues, nullValue, getFieldValues(records, dataField), opts);
  }

  // get the name of the output field
  //
  if (looksLikeColors) {
    outputField = lyr.geometry_type == 'polyline' ? 'stroke' : 'fill';
  } else {
    outputField = 'class';
  }
  if (opts.save_as) {
    outputField = opts.save_as; // override the default field name
  } else {
    message(`Output was saved to "${outputField}" field (use save-as= to change)`);
    // message('Use save-as=<field> to save to a different field');
  }

  records.forEach(function(d, i) {
    d = d || {};
    d[outputField] = classify(d[dataField]);
  });
};


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

function formatValuesForLogging(arr) {
  if (arr.some(val => utils.isString(val) && val.indexOf('rgb(') === 0)) {
    return formatColorsAsHex(arr);
  }
  return arr;
}

function formatColorsAsHex(colors) {
  var d3 = require('d3-color');
  return colors.map(function(col) {
    var o = d3.color(col);
    if (!o) stop('Unable to parse color:', col);
    return o.formatHex();
  });
}


function getIndexValues(n) {
  var vals = [];
  for (var i=0; i<n; i++) {
    vals.push(i);
  }
  return vals;
}
