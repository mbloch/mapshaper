import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { requireDataField } from '../dataset/mapshaper-layer-utils';
import { getRoundingFunction } from '../geom/mapshaper-rounding';
import { getFieldValues } from '../datatable/mapshaper-data-utils';
import { isColorSchemeName, getColorRamp, fillOutRamp, getCategoricalColorScheme } from '../color/color-schemes';
import { getSequentialClassifier, getContinuousClassifier, getCategoricalClassifier, getQuantileBreaks, getEqualIntervalBreaks, getClassId, getDataRange } from '../classification/mapshaper-classification';
import cmd from '../mapshaper-cmd';

cmd.classify = function(lyr, optsArg) {
  var opts = optsArg || {};
  var dataField = opts.field;
  requireDataField(lyr.data, dataField);
  var records = lyr.data && lyr.data.getRecords();
  var dataValues = getFieldValues(records, dataField);
  var colorScheme = opts.color_scheme || null;
  var classes = opts.classes || null; // number of classes
  var nullValue = opts.null_value || null;
  var nullColor = nullValue || 'white';
  var classValues, classify;

  if (opts.breaks) {
    // TODO: check for invalid combinations of breaks= and classes=
    classes = opts.breaks + 1;
  }

  if (colorScheme) {
    // using a named color scheme: generate a ramp
    if (!isColorSchemeName(colorScheme)) {
      stop('Unknown color scheme:', colorScheme);
    }
    if (opts.categories) {
      classValues = getCategoricalColorScheme(colorScheme, opts.categories.length);
      classes = classValues.length;
    } else if (classes > 0 === false) {
      stop('color-scheme= option requires classes= or breaks=');
    } else {
      classValues = getColorRamp(colorScheme, classes);
    }
    nullValue = nullColor;
    printColors(classValues);

  } else if (opts.colors) {
    // using a list of colors: interpolate more colors if needed
    if (classes && classes > opts.colors.length) {
      // interpolate colors if number of classes is given and doesn't match
      // the number of colors
      classValues = fillOutRamp(opts.colors, classes);
    } else {
      classValues = opts.colors;
    }
    nullValue = nullColor;

  } else if (opts.values) {
    // assigning values for each class
    classValues = parseValues(opts.values);

  } else if (classes > 1) {
    // assigning indexes for each class
    classValues = getIndexValues(opts.classes);
    nullValue = -1;
  }

  if (!classValues || classValues.length > 0 === false) {
    stop('Missing a valid number of classes');
  }

  if (opts.invert) {
    // utils.genericSort(breaks, false);
    utils.genericSort(classValues, false);
  }

  if (opts.categories) {
    // categorical color scheme
    classify = getCategoricalClassifier(opts.categories, classValues, opts.other, nullValue);

  } else {
    // sequential color scheme
    classify = getNumericalClassifier(dataValues, classValues, nullValue, opts);
  }

  if (opts.save_as) {
    dataValues.forEach(function(val, i) {
      var r = records[i] || {};
      r[opts.save_as] = classify(val);
    });
  } else {
    message('Use save-as=<field> to save output to a field');
  }
};

function getNumericalClassifier(dataValues, classValues, nullValue, opts) {
  // continuously interpolated colors/values use one fewer breakpoint than
  // discreetly classed values
  var numBreaks = opts.continuous ? classValues.length - 2 : classValues.length - 1;
  var round = opts.precision ? getRoundingFunction(opts.precision) : null;
  var breaks;

  if (round) {
    dataValues = dataValues.map(round);
  }

  if (opts.breaks) {
    // user-defined breaks
    breaks = opts.breaks;
  } else if (opts.equal_interval) {
    breaks = getEqualIntervalBreaks(dataValues, numBreaks);
  } else if (opts.quantile) {
    breaks = getQuantileBreaks(dataValues, numBreaks);
  } else {
    stop('Missing a classification type');
  }

  var dataRange = getDataRange(dataValues);

  message('Data range:', dataRange);
  message('Computed breaks:', breaks);
  printDistributionInfo(breaks, dataValues);

  return opts.continuous ?
    getContinuousClassifier(breaks, dataRange, classValues, nullValue) :
    getSequentialClassifier(breaks, classValues, nullValue);
}

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

function printColors(colors) {
  var d3 = require('d3-color');
  var arr = colors.map(function(col) { return d3.color(col).formatHex(); });
  message('Colors:', arr);
}

function printDistributionInfo(breaks, values) {
  var dist = getDistributionData(breaks, values);
  message('Distribution:', dist.join(','));
  if (dist.nulls) {
    message('Null values:', dist.nulls);
  }
}

function getDistributionData(breaks, values) {
  var arr = utils.initializeArray(new Array(breaks.length + 1), 0);
  var nulls = 0;
  values.forEach(function(val) {
    var i = getClassId(val, breaks);
    if (i == -1) {
      nulls++;
    } else {
      arr[i]++;
    }
  });
  arr.nulls = nulls;
  return arr;
}

function getIndexValues(n) {
  var vals = [];
  for (var i=0; i<n; i++) {
    vals.push(i);
  }
  return vals;
}
