import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { requireDataField, initDataTable } from '../dataset/mapshaper-layer-utils';
import { getFieldValues } from '../datatable/mapshaper-data-utils';
import {
  getSequentialClassifier,
  getAscendingNumbers,
  applyDataRange
} from '../classification/mapshaper-sequential-classifier';
import {
  isDivergingClassification,
  getDivergingLayout,
  formatDivergingLayout
} from '../classification/mapshaper-diverging';
import { getRoundingFunction } from '../geom/mapshaper-rounding';
import {
  getCategoricalClassifier
} from '../classification/mapshaper-categorical-classifier';
import { getNonAdjacentClassifier } from '../color/graph-color';
import {
  getIndexedClassifier,
  getIndexedClassCount
} from '../classification/mapshaper-indexed-classifier';

import cmd from '../mapshaper-cmd';
import { getUniqFieldValues, getColumnType } from '../datatable/mapshaper-data-utils';
import { getClassValues, getDivergingClassValues, getNullValue } from '../classification/mapshaper-classify-ramps';
import { getClassifyMethod } from '../classification/mapshaper-classify-methods';
import { color as d3_color } from 'd3-color';
import { getBlackiClassifier } from '../classification/mapshaper-blacki';
import { getInterpolationOptions } from '../classification/mapshaper-interpolation';

cmd.classify = function(lyr, dataset, optsArg) {
  if (!lyr.data) {
    initDataTable(lyr);
  }
  var opts = optsArg || {};
  var records = lyr.data && lyr.data.getRecords();
  var valuesAreColors = !!opts.colors;
  var dataField, fieldType, outputField;
  var values, nullValue;
  var classifyByValue, classifyByRecordId;
  var numClasses, numValues;
  var method, diverging, divergingLayout;

  if (opts.color_scheme) {
    stop('color-scheme is not a valid option, use colors instead');
  }
  opts = Object.assign({}, opts, getInterpolationOptions(opts));

  // get data field to use for classification
  //
  if (opts.index_field) {
    dataField = opts.index_field;
    fieldType = getColumnType(opts.field, records);
  } else if (opts.field) {
    dataField = opts.field;
    fieldType = getColumnType(opts.field, records);
  }
  if (dataField) {
    requireDataField(lyr.data, dataField);
  }

  // get classification method
  //
  method = getClassifyMethod(opts, fieldType);

  // validate classification method
  if (method == 'non-adjacent') {
    if (lyr.geometry_type != 'polygon') {
      stop('The non-adjacent option requires a polygon layer');
    }
    if (dataField) {
      stop('The non-adjacent option does not accept a data field argument');
    }
  } else if (!dataField) {
    stop('Missing a data field to classify');
  }

  // get the number of classes and the number of values
  //
  // expand categories if value is '*'
  // use all unique values if categories option is missing
  // (empty values are not categories: they get the null value)
  if (method == 'categorical') {
    if ((!opts.categories || opts.categories.includes('*')) && dataField) {
      opts.categories = getUniqFieldValues(records, dataField).filter(isCategoryValue);
    }
    if (opts.categories && fieldType == 'number') {
      opts.categories = opts.categories.map(str => +str);
    }
  }

  diverging = isDivergingClassification(opts);
  if (diverging) {
    validateDivergingOptions(method, fieldType, opts);
  } else if (opts.no_pivot_class) {
    stop('no-pivot-class requires pivot= or pivot-range=');
  }
  if (Array.isArray(opts.classes) && !diverging) {
    if (opts.classes.length != 1) {
      stop('classes= takes two numbers (classes below and above the pivot) only with pivot=');
    }
    opts.classes = opts.classes[0];
  }

  if (diverging) {
    // the classes depend on the data (see getDivergingLayout())
    numClasses = 0;
  } else if (opts.classes) {
    if (!utils.isInteger(opts.classes) || opts.classes > 1 === false) {
      stop('Invalid number of classes:', opts.classes, '(expected a value greater than 1)');
    }
    numClasses = opts.classes;
  } else if (method == 'blacki') {
    numClasses = 999; // dummy value
  } else if (method == 'indexed' && dataField) {
    numClasses = getIndexedClassCount(records, dataField);
  } else if (opts.breaks) {
    numClasses = opts.breaks.length + 1;
  } else if (method == 'categorical' && opts.categories) {
    numClasses = opts.categories.length;
  } else if (opts.colors && opts.colors.length > 1) {
    numClasses = opts.colors.length;
  } else if (opts.values && opts.values.length > 1) {
    numClasses = opts.values.length;
  } else if (method == 'non-adjacent') {
    numClasses = 5;
  } else {
    numClasses = 4;
  }
  numValues = opts.continuous ? numClasses + 1 : numClasses;
  if (numValues > 1 === false && !diverging) {
    stop('Missing a valid number of values');
  }

  // get colors or other values
  //
  if (diverging && fieldType === null) {
    values = []; // no data: every feature gets the null value
  } else if (diverging) {
    divergingLayout = getDivergingLayout(getDivergingData(records, dataField, opts), method,
      Object.assign({}, opts, {classes: getDivergingClassCount(opts)}));
    message(formatDivergingLayout(divergingLayout));
    values = getDivergingClassValues(divergingLayout, opts);
  } else {
    values = getClassValues(method, numValues, opts);
    if (opts.invert) {
      values = values.concat().reverse();
    }
  }
  if (valuesAreColors) {
    message('Colors:', formatValuesForLogging(values));
  }

  nullValue = getNullValue(opts);

  // get a function to convert input data to class indexes
  //
  if (fieldType === null) {
    // no valid data -- always return null value
    classifyByRecordId = function() {return nullValue;};
  } else if (method == 'blacki') {
    classifyByRecordId = getBlackiClassifier(lyr, dataField);
  } else if (method == 'non-adjacent') {
    classifyByRecordId = getNonAdjacentClassifier(lyr, dataset, values);
  } else if (method == 'indexed') {
    // data is pre-classified... just read the index from a field
    classifyByValue = getIndexedClassifier(values, nullValue, opts);
  } else if (method == 'categorical') {
    classifyByValue = getCategoricalClassifier(values, nullValue, opts);
  } else if (diverging) {
    classifyByValue = getSequentialClassifier(values, nullValue, getFieldValues(records, dataField), method,
      Object.assign({}, opts, {breaks: divergingLayout.breaks}));
  } else {
    classifyByValue = getSequentialClassifier(values, nullValue, getFieldValues(records, dataField), method, opts);
  }

  if (classifyByValue) {
    classifyByRecordId = function(id) {
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

  lyr.data.captureSchemaBefore({operation: 'classify', field: outputField});
  records.forEach(function(d, i) {
    d[outputField] = classifyByRecordId(i);
  });
  lyr.data.markSchemaChanged({operation: 'classify', field: outputField});
};

function validateDivergingOptions(method, fieldType, opts) {
  if (fieldType === null) return; // no data
  if (fieldType != 'number') {
    stop('pivot= requires a numeric data field');
  }
  if (!['quantile', 'equal-interval', 'nice', 'hybrid', 'breaks'].includes(method)) {
    stop('The', method, 'method does not support pivot=');
  }
  if (opts.continuous) {
    stop('pivot= does not support continuous classes');
  }
}

// The data that the classes divide: numbers, rounded and clamped as the
// sequential classifier does
function getDivergingData(records, field, opts) {
  var values = getFieldValues(records, field);
  var ascending;
  if (opts.precision) {
    values = values.map(getRoundingFunction(opts.precision));
  }
  ascending = getAscendingNumbers(values);
  if (opts.outer_breaks) {
    ascending = applyDataRange(ascending, opts.outer_breaks);
  }
  return ascending;
}

// The total number of classes (including a pivot class), or the numbers of
// classes [below, above] the pivot
function getDivergingClassCount(opts) {
  var hasNeutral = !opts.no_pivot_class;
  if (opts.classes) return opts.classes;
  if (opts.colors && opts.colors.length > 1) return opts.colors.length;
  if (opts.values && opts.values.length > 1) return opts.values.length;
  return hasNeutral ? 7 : 6;
}

// Like the categorical classifier, counts 0 as a value and other falsy
// values (null, undefined, '', NaN) as empty
export function isCategoryValue(val) {
  return !!val || val === 0;
}

function formatValuesForLogging(arr) {
  if (arr.some(val => utils.isString(val) && val.indexOf('rgb(') === 0)) {
    return formatColorsAsHex(arr);
  }
  return arr;
}

function formatColorsAsHex(colors) {
  return colors.map(function(col) {
    var o = d3_color(col);
    if (!o) stop('Unable to parse color:', col);
    return o.formatHex();
  });
}
