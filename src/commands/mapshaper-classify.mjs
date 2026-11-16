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
  hasPivotClass,
  getDivergingLayout,
  getDivergingStops,
  getContinuousDivergingClassifier,
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
import { hasPercentBreaks, resolvePercentBreaks } from '../classification/mapshaper-percent-breaks';
import { layerHasRaster } from '../dataset/mapshaper-layer-utils';
import { getRasterGrid, getRasterGridBandIndex } from '../rasters/mapshaper-raster-utils';
import { noteLayerWillChange, markLayerChanged } from '../undo/mapshaper-undo-tracking';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import {
  formatRasterSampleMessage,
  getRasterBandCategories,
  getRasterBandSample,
  getRasterClassifyBand,
  getRasterPaletteFromClassification,
  getRasterHypsometricPalette,
  getTrimmedRange,
  rasterBandIsInteger,
  setRasterPalette,
  validateRasterClassifyOptions
} from '../rasters/mapshaper-raster-classify';
import { setRasterPaletteSea, splitRampOptions } from '../rasters/mapshaper-raster-hypsometric';
import { listHasRampNames } from '../cli/mapshaper-option-parsing-utils';
import { setRasterCategoryNames } from '../rasters/mapshaper-raster-categories';

cmd.classify = function(lyr, dataset, optsArg) {
  var opts = optsArg || {};
  var records, dataField, fieldType, outputField, o, classifyByRecordId;
  if (opts.color_scheme) {
    stop('color-scheme is not a valid option, use colors instead');
  }
  if (layerHasRaster(lyr)) {
    classifyRasterLayer(lyr, dataset, opts);
    return;
  }
  if (opts.category_names) {
    stop('category-names= works with raster layers');
  }
  if (opts.hypsometric || opts.sea || opts.classed) {
    stop((opts.hypsometric ? 'hypsometric=' : opts.sea ? 'sea=' : 'classed') + ' works with raster layers');
  }
  if (listHasRampNames(opts.colors) || listHasRampNames(opts.breaks)) {
    stop('Named lists in colors= and breaks= (e.g. sea:...) work with raster layers');
  }
  if (!lyr.data) {
    initDataTable(lyr);
  }
  records = lyr.data.getRecords();

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

  o = getClassification({
    field: dataField,
    type: fieldType,
    values: dataField ? getFieldValues(records, dataField) : [],
    getCategories: function() { return getUniqFieldValues(records, dataField); },
    records: records,
    lyr: lyr,
    dataset: dataset
  }, opts);

  classifyByRecordId = o.classifyByRecordId || function(id) {
    var d = records[id] || {};
    return o.classifyByValue(d[dataField]);
  };

  // get the name of the output field
  //
  if (o.valuesAreColors) {
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

// Resolves the classes of -classify, for a layer's records or a raster's
// pixel values
// @data {field, type, values, getCategories, getPercentRange, records, lyr, dataset}
//   values: the field's values (one per record, or a sample of pixel values)
//   getCategories(): the default categories
//   getPercentRange(): optional; the range that percentage breaks are of
//   records, lyr, dataset: for the methods that classify features rather than
//     values (blacki, non-adjacent, indexed)
// Returns {method, values, valuesAreColors, nullValue, diverging,
//   divergingLayout, classifyByValue, classifyByRecordId, sequential}
//   sequential: the sequential classifier, with its breaks and range (see
//     getSequentialClassifier())
function getClassification(data, optsArg) {
  var opts = Object.assign({}, optsArg, getInterpolationOptions(optsArg));
  var dataField = data.field;
  var fieldType = data.type;
  var valuesAreColors = !!opts.colors;
  var values, nullValue, sequential;
  var classifyByValue, classifyByRecordId;
  var numClasses, numValues;
  var method, diverging, divergingLayout, divergingData;

  // get classification method
  //
  method = getClassifyMethod(opts, fieldType);

  // (without data, only the number of breaks matters)
  if (hasPercentBreaks(opts.breaks) && fieldType == 'number') {
    opts.breaks = resolvePercentBreaks(opts.breaks, data.getPercentRange ?
      data.getPercentRange(opts) : getPercentBreaksRange(data.values, opts));
    message('Breaks: breaks=' + opts.breaks.join(','));
  }

  // validate classification method
  if (method == 'non-adjacent') {
    if (!data.lyr || data.lyr.geometry_type != 'polygon') {
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
      opts.categories = data.getCategories().filter(isCategoryValue);
    }
    if (opts.categories && fieldType == 'number') {
      opts.categories = opts.categories.map(str => +str);
    }
  }

  diverging = isDivergingClassification(opts);
  if (diverging) {
    validateDivergingOptions(method, fieldType, opts);
  } else if (opts.no_pivot_class || opts.pivot_class) {
    stop(opts.pivot_class ? 'pivot-class' : 'no-pivot-class', 'requires pivot= or pivot-range=');
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
    // continuous output can have a single interval, from the min to the max
    if (!utils.isInteger(opts.classes) || opts.classes >= (opts.continuous ? 1 : 2) === false) {
      stop('Invalid number of classes:', opts.classes, '(expected a value greater than 1)');
    }
    numClasses = opts.classes;
  } else if (method == 'blacki') {
    numClasses = 999; // dummy value
  } else if (method == 'indexed' && dataField) {
    numClasses = getIndexedClassCount(data.records, dataField);
  } else if (opts.breaks) {
    numClasses = opts.breaks.length + 1;
  } else if (method == 'categorical' && opts.categories) {
    numClasses = opts.categories.length;
  } else if (opts.colors && opts.colors.length > 1) {
    // continuous: each color is a stop, at the ends and breaks of the classes
    numClasses = opts.continuous ? opts.colors.length - 1 : opts.colors.length;
  } else if (opts.values && opts.values.length > 1) {
    numClasses = opts.continuous ? opts.values.length - 1 : opts.values.length;
  } else if (method == 'non-adjacent') {
    numClasses = 5;
  } else {
    numClasses = 4;
  }
  numValues = opts.continuous ? numClasses + 1 : numClasses;
  if (method == 'categorical' && numValues > 0 === false) {
    stop('Missing categories to classify');
  } else if (method != 'categorical' && numValues > 1 === false && !diverging) {
    stop('Missing a valid number of values');
  }

  // get colors or other values
  //
  if (diverging && fieldType === null) {
    values = []; // no data: every feature gets the null value
  } else if (diverging) {
    divergingData = getDivergingData(data.values, opts);
    divergingLayout = getDivergingLayout(divergingData, method,
      Object.assign({}, opts, {classes: getDivergingClassCount(opts)}));
    message(formatDivergingLayout(divergingLayout));
    if (opts.continuous) {
      message(formatDivergingStops(divergingLayout));
    }
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
    classifyByRecordId = getBlackiClassifier(data.lyr, dataField);
  } else if (method == 'non-adjacent') {
    classifyByRecordId = getNonAdjacentClassifier(data.lyr, data.dataset, values);
  } else if (method == 'indexed') {
    // data is pre-classified... just read the index from a field
    classifyByValue = getIndexedClassifier(values, nullValue, opts);
  } else if (method == 'categorical') {
    classifyByValue = getCategoricalClassifier(values, nullValue, opts);
  } else if (diverging && opts.continuous) {
    classifyByValue = getContinuousDivergingDataClassifier(divergingLayout, values, nullValue, opts, divergingData);
  } else if (diverging) {
    sequential = classifyByValue = getSequentialClassifier(values, nullValue, data.values, method,
      Object.assign({}, opts, {breaks: divergingLayout.breaks}));
  } else {
    sequential = classifyByValue = getSequentialClassifier(values, nullValue, data.values, method, opts);
  }

  return {
    opts: opts,
    method: method,
    values: values,
    valuesAreColors: valuesAreColors,
    nullValue: nullValue,
    diverging: diverging,
    divergingLayout: divergingLayout || null,
    classifyByValue: classifyByValue || null,
    classifyByRecordId: classifyByRecordId || null,
    sequential: sequential || null
  };
}

// -classify on a raster layer sets a palette, a display setting: the pixels
// are not changed (see docs/development/raster-palette-design.md)
function classifyRasterLayer(lyr, dataset, optsArg) {
  var raster = lyr.raster;
  var grid = getRasterGrid(raster);
  var opts = splitRampOptions(optsArg);
  var crs = dataset ? getDatasetCRS(dataset) : null;
  var band, bandIndex, categorical, sample, o, palette;
  validateRasterClassifyOptions(raster, grid, opts);
  band = getRasterClassifyBand(grid, opts);
  bandIndex = getRasterGridBandIndex(grid, band);
  if (opts.hypsometric) {
    palette = setRasterPaletteSea(getRasterHypsometricPalette(raster, band, opts, crs), raster, opts, crs);
    noteLayerWillChange(lyr, {operation: 'classify', unit: 'raster'});
    setRasterPalette(raster, palette);
    markLayerChanged(lyr, {operation: 'classify', unit: 'raster'});
    return;
  }
  categorical = getClassifyMethod(opts, 'number') == 'categorical';
  if (categorical && !rasterBandIsInteger(grid)) {
    stop('Categories need a band of integer values (band ' + band + ' is ' + grid.pixelType + ')');
  }
  sample = getRasterBandSample(grid, bandIndex);
  if (sample.values.length === 0) {
    stop('Band ' + band + ' has no valid values to classify');
  }
  message(formatRasterSampleMessage(band, sample));
  o = getClassification({
    field: 'band' + band,
    type: 'number',
    values: sample.values,
    getCategories: function() { return getRasterBandCategories(grid, bandIndex); },
    getPercentRange: function(opts) {
      return opts.outer_breaks || getTrimmedRange(sample.values);
    }
  }, Object.assign({}, opts, {count_label: sample.sampled ? 'sampled pixel counts' : 'pixel counts'}));
  palette = setRasterPaletteSea(getRasterPaletteFromClassification(o, band, opts, sample.values), raster, opts, crs);
  noteLayerWillChange(lyr, {operation: 'classify', unit: 'raster'});
  if (opts.category_names) {
    setRasterCategoryNames(grid, band, getCategoryNamesOption(opts.category_names, palette));
  }
  setRasterPalette(raster, palette);
  markLayerChanged(lyr, {operation: 'classify', unit: 'raster'});
}

// {<value>: name} from category-names=, a name for each category in the order
// of their colors ('' for a category without one)
function getCategoryNamesOption(list, palette) {
  var names = {};
  if (palette.type != 'categorical') {
    stop('category-names= works with method=categorical');
  }
  if (list.length != palette.categories.length) {
    stop(utils.format('category-names= needs a name for each of the %d categories (it has %d)',
      palette.categories.length, list.length));
  }
  palette.categories.forEach(function(val, i) {
    var name = String(list[i]).trim();
    if (name) names[val] = name;
  });
  return names;
}

function validateDivergingOptions(method, fieldType, opts) {
  if (fieldType === null) return; // no data
  if (fieldType != 'number') {
    stop('pivot= requires a numeric data field');
  }
  if (!['quantile', 'equal-interval', 'nice', 'hybrid', 'breaks'].includes(method)) {
    stop('The', method, 'method does not support pivot=');
  }
}

// Rounds and clamps data values as getDivergingData() does
function getContinuousDivergingDataClassifier(layout, values, nullValue, opts, ascending) {
  var classify = getContinuousDivergingClassifier(layout, values, nullValue, opts, ascending);
  var round = opts.precision ? getRoundingFunction(opts.precision) : null;
  var range = opts.outer_breaks;
  return function(val) {
    if (!utils.isFiniteNumber(val)) return nullValue;
    if (round) val = round(val);
    if (range) val = Math.min(Math.max(val, range[0]), range[1]);
    return classify(val);
  };
}

function formatDivergingStops(layout) {
  var stops = getDivergingStops(layout);
  var parts = [];
  if (stops.below.length > 0) parts.push('below: ' + stops.below.join(', '));
  if (stops.above.length > 0) parts.push('above: ' + stops.above.join(', '));
  return 'Color stops (' + parts.join('; ') + ')';
}

// The range that percentage breaks are percentages of: outer-breaks=, or the
// data's min and max (rounded as the classifiers round values)
function getPercentBreaksRange(values, opts) {
  var round = opts.precision ? getRoundingFunction(opts.precision) : null;
  var min = Infinity, max = -Infinity;
  if (opts.outer_breaks) return opts.outer_breaks;
  values.forEach(function(val) {
    if (!utils.isFiniteNumber(val)) return;
    if (round) val = round(val);
    if (val < min) min = val;
    if (val > max) max = val;
  });
  return [min, max];
}

// The data that the classes divide: numbers, rounded and clamped as the
// sequential classifier does
function getDivergingData(values, opts) {
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
  var hasNeutral = hasPivotClass(opts);
  var list = opts.colors && opts.colors.length > 1 && opts.colors ||
    opts.values && opts.values.length > 1 && opts.values;
  if (opts.classes) return opts.classes;
  if (list && opts.continuous) {
    // a list of 2K+1 colors has K stops on each side, for K-1 classes
    return Math.max(2, (Math.floor(list.length / 2) - 1) * 2) + (hasNeutral ? 1 : 0);
  }
  if (list) return list.length;
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
