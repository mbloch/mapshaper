import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { requireDataField, initDataTable } from '../dataset/mapshaper-layer-utils';
import { getFieldValues } from '../datatable/mapshaper-data-utils';
import { isColorSchemeName, getColorRamp, getCategoricalColorScheme, isCategoricalColorScheme } from '../color/color-schemes';
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
import { getNonAdjacentClassifier } from '../color/graph-color';

cmd.classify = function(lyr, dataset, optsArg) {
  if (!lyr.data) {
    initDataTable(lyr);
  }
  var opts = optsArg || {};
  var records = lyr.data && lyr.data.getRecords();
  var nullValue = opts.null_value || null;
  var valuesAreColors = !!opts.colors || !!opts.color_scheme;
  var colorScheme;
  var values, classifyByValue, classifyById;
  var numClasses, numValues;
  var dataField, outputField;
  var method;

  // validate explicitly set classes
  if (opts.classes) {
    if (!utils.isInteger(opts.classes) || opts.classes > 1 === false) {
      stop('Invalid number of classes:', opts.classes, '(expected a value greater than 1)');
    }
    numClasses = opts.classes;
  }

  // TODO: better validation of breaks values
  if (opts.breaks) {
    numClasses = opts.breaks.length + 1;
  }

  if (opts.index_field) {
    dataField = opts.index_field;
    if (numClasses > 0 === false) {
      stop('The index-field= option requires the classes= option to be set');
    }
    // You can't infer the number of classes by looking at index values;
    // this can cause unwanted interpolation if one or more values are
    // not present in the index field
    // numClasses = validateClassIndexField(records, opts.index_field);

  } else if (opts.field) {
    dataField = opts.field;
  }

  // expand categories if value is '*'
  if (dataField && opts.categories && opts.categories.includes('*')) {
    opts.categories = getUniqFieldValues(records, dataField);
  }

  // get classification method
  //
  if (opts.method) {
    method = opts.method;
  } else if (opts.categories) {
    method = 'categorical';
  } else if (opts.index_field) {
    method = 'indexed';
  } else {
    method = 'quantile'; // TODO: validate data field
  }

  if (method == 'non-adjacent') {
    if (lyr.geometry_type != 'polygon') {
      stop('The non-adjacent option requires a polygon layer');
    }
    if (dataField) {
      stop('The non-adjacent option does not accept a data field argument');
    }
  } else if (!dataField) {
    stop('Missing a data field to classify');
  } else {
    requireDataField(lyr.data, dataField);
  }

  if (numClasses) {
    numValues = opts.continuous ? numClasses + 1 : numClasses;
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

  /// get values (usually colors)
  ///
  if (colorScheme) {
    if (method == 'non-adjacent') {
      numClasses = numValues = numClasses || 5;
      values = getCategoricalColorScheme(colorScheme, numValues);

    } else if (method == 'categorical') {
      values = getCategoricalColorScheme(colorScheme, opts.categories.length);
      numClasses = numValues = values.length;

    } else {
      if (!numClasses) {
        // stop('color-scheme= option requires classes= or breaks=');
        numClasses = 4; // use a default number of classes
        numValues = opts.continuous ? numClasses + 1 : numClasses;
      }
      values = getColorRamp(colorScheme, numValues, opts.stops);
    }

  } else if (opts.colors || opts.values) {
    values = opts.values ? parseValues(opts.values) : opts.colors;
    if (!numValues) {
      numValues = values.length;
    }
    if ((values.length != numValues || opts.stops) && numValues > 1) {
      // TODO: handle numValues == 1
      // TODO: check for non-interpolatable value types (e.g. boolean, text)
      values = interpolateValuesToClasses(values, numValues, opts.stops);
    }

  } else if (numValues > 1) {
    // no values were given: assign indexes for each class
    values = getIndexValues(numValues);
    nullValue = -1;
  }

  if (valuesAreColors) {
    nullValue = nullValue || '#eee';
  }

  if (numValues > 1 === false) {
    stop('Missing a valid number of classes');
  }

  if (opts.invert) {
    values = values.concat().reverse();
  }

  if (valuesAreColors) {
    message('Colors:', formatValuesForLogging(values));
  }

  // get a function to convert input data to class indexes
  //
  if (method == 'non-adjacent') {
    classifyById = getNonAdjacentClassifier(lyr, dataset, values);
  } else if (opts.index_field) {
    // data is pre-classified... just read the index from a field
    classifyByValue = getIndexedClassifier(values, nullValue, opts);
  } else if (method == 'categorical') {
    classifyByValue = getCategoricalClassifier(values, nullValue, opts);
  } else {
    classifyByValue = getSequentialClassifier(values, nullValue, getFieldValues(records, dataField), method, opts);
  }

  if (classifyByValue) {
    classifyById = function(id) {
      var d = records[id] || {};
      return classifyByValue(d[dataField]);
    };
  }


  // get the name of the output field
  //
  if (valuesAreColors) {
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
    d[outputField] = classifyById(i);
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
