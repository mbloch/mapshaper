import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import { getFieldValues } from '../datatable/mapshaper-data-utils';
import { isColorSchemeName, getColorRamp, getCategoricalColorScheme } from '../color/color-schemes';
import {
  getSequentialClassifier,
  getCategoricalClassifier,
  interpolateValuesToClasses,
  getDistributionData,
  getDiscreteValueGetter,
  getInterpolatedValueGetter
} from '../classification/mapshaper-classification';
import cmd from '../mapshaper-cmd';

cmd.classify = function(lyr, optsArg) {
  var opts = optsArg || {};
  var records = lyr.data && lyr.data.getRecords();
  var nullValue = opts.null_value || null;
  var looksLikeColors = !!opts.colors || !!opts.color_scheme;
  var classValues, classify, classToValue;
  var numBuckets, numValues, dataValues;
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
    numBuckets = validateClassIndexField(records, opts.index_field);

  } else if (opts.field) {
    dataField = opts.field;

  } else {
    stop('Missing a data field to classify');
  }

  requireDataField(lyr.data, dataField);

  if (numBuckets) {
    numValues = opts.continuous ? numBuckets + 1 : numBuckets;
  }

  if (opts.color_scheme) {
    // using a named color scheme: generate a ramp
    if (!isColorSchemeName(opts.color_scheme)) {
      stop('Unknown color scheme:', opts.color_scheme);
    }
    if (opts.categories) {
      classValues = getCategoricalColorScheme(opts.color_scheme, opts.categories.length);
      message('Colors:', formatValuesForLogging(classValues));
      numBuckets = numValues = classValues.length;
    } else {
      if (!numBuckets) {
        // stop('color-scheme= option requires classes= or breaks=');
        numBuckets = 4; // use a default number of classes
        numValues = opts.continuous ? numBuckets + 1 : numBuckets;
      }
      classValues = getColorRamp(opts.color_scheme, numValues);
    }

  } else if (opts.colors || opts.values) {
    classValues = opts.values ? parseValues(opts.values) : opts.colors;
    if (!numValues) {
      numValues = classValues.length;
      numBuckets = opts.continuous ? numValues - 1 : numValues;
    }
    if (classValues.length != numValues && numValues > 1) {
      // TODO: handle numValues == 1
      // TODO: check for non-interpolatable value types (e.g. boolean, text)
      classValues = interpolateValuesToClasses(classValues, numValues);
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
    classify = getIndexClassifier(numBuckets);
  } else if (opts.categories) {
    classify = getCategoricalClassifier(opts.categories);
  } else {
    classify = getSequentialClassifier(getFieldValues(records, dataField), numBuckets, opts);
  }

  // get a function to convert class indexes to output values
  //
  if (opts.continuous && !opts.categories) {
    classToValue = getInterpolatedValueGetter(classValues, nullValue);
  } else {
    classToValue = getDiscreteValueGetter(classValues, nullValue, opts.other);
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
    d[outputField] = classToValue(classify(d[dataField]));
  });
};

// returns the number of classes, based on the largest class index found
function validateClassIndexField(records, name) {
  var invalid = [];
  var maxId = -1;
  records.forEach(function(d) {
    var val = (d || {})[name];
    if (!utils.isInteger(val) || val < -2) {
      invalid.push(val);
    } else {
      maxId = Math.max(maxId, val);
    }
  });
  if (invalid.length > 0) {
    stop(`Class index field contains invalid value(s): ${invalid.slice(0, 5)}`);
  }
  return maxId + 1;
}

function getIndexClassifier(numBuckets) {
  return function(val) {
    return utils.isInteger(val) && val >= 0 && val < numBuckets ? val : -1;
  };
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
