import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { requireDataField, initDataTable } from '../dataset/mapshaper-layer-utils';
import { getFieldValues } from '../datatable/mapshaper-data-utils';
import {
  getSequentialClassifier,
} from '../classification/mapshaper-sequential-classifier';
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
import { getClassValues } from '../classification/mapshaper-classify-ramps';
import { getClassifyMethod } from '../classification/mapshaper-classify-methods';

cmd.classify = function(lyr, dataset, optsArg) {
  if (!lyr.data) {
    initDataTable(lyr);
  }
  var opts = optsArg || {};
  var records = lyr.data && lyr.data.getRecords();
  var valuesAreColors = !!opts.colors;
  var dataField, dataFieldType, outputField;
  var values, nullValue;
  var classifyByValue, classifyByRecordId;
  var numClasses, numValues;
  var method;

  if (opts.color_scheme) {
    stop('color-scheme is not a valid option, use colors instead');
  }

  // get data field to use for classification
  //
  if (opts.index_field) {
    dataField = opts.index_field;
  } else if (opts.field) {
    dataField = opts.field;
    dataFieldType = getColumnType(opts.field, records);
  }
  if (dataField) {
    requireDataField(lyr.data, dataField);
  }

  // get classification method
  //
  method = getClassifyMethod(opts, dataFieldType);

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
  if (method == 'categorical') {
    if ((!opts.categories || opts.categories.includes('*')) && dataField) {
      opts.categories = getUniqFieldValues(records, dataField);
    }
  }

  if (opts.classes) {
    if (!utils.isInteger(opts.classes) || opts.classes > 1 === false) {
      stop('Invalid number of classes:', opts.classes, '(expected a value greater than 1)');
    }
    numClasses = opts.classes;
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
  if (numValues > 1 === false) {
    stop('Missing a valid number of values');
  }

  // get colors or other values
  //
  values = getClassValues(method, numValues, opts);
  if (opts.invert) {
    values = values.concat().reverse();
  }
  if (valuesAreColors) {
    message('Colors:', formatValuesForLogging(values));
  }

  // get null value
  //
  if ('null_value' in opts) {
    nullValue = opts.null_value;
  } else if (valuesAreColors) {
    nullValue = '#eee';
  } else if (opts.values) {
    nullValue = null;
  } else {
    nullValue = -1; // kludge, to match behavior of getClassValues()
  }


  // get a function to convert input data to class indexes
  //
  if (method == 'non-adjacent') {
    classifyByRecordId = getNonAdjacentClassifier(lyr, dataset, values);
  } else if (opts.index_field) {
    // data is pre-classified... just read the index from a field
    classifyByValue = getIndexedClassifier(values, nullValue, opts);
  } else if (method == 'categorical') {
    classifyByValue = getCategoricalClassifier(values, nullValue, opts);
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

  records.forEach(function(d, i) {
    d[outputField] = classifyByRecordId(i);
  });
};

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
