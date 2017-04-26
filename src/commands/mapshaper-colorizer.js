/* @requires mapshaper-common, mapshaper-rounding */

api.colorizer = function(opts) {
  if (!opts.name) {
    stop("Missing required name= parameter");
  }

  internal.defs[opts.name] = internal.getColorizerFunction(opts);
};

internal.getColorizerFunction = function(opts) {
  var nodataColor = opts.nodata || '#eee';
  var round = opts.precision ? utils.getRoundingFunction(opts.precision) : null;
  var colorFunction;

  if (!opts.colors || !opts.colors.length) {
    stop("Missing colors= parameter");
  }

  if (opts.breaks) {
    colorFunction = internal.getSequentialColorFunction(opts.colors, opts.breaks, round);
  } else if (opts.categories) {
    colorFunction = internal.getCategoricalColorFunction(opts.colors, opts.other, opts.categories);
  } else {
    stop("Missing categories= or breaks= parameter");
  }

  return function(val) {
    var col = colorFunction(val);
    return col || nodataColor;
  };
};

internal.getCategoricalColorFunction = function(colors, otherColor, keys) {
  if (colors.length != keys.length) {
    stop("Number of colors should be equal to the number of categories");
  }

  return function(val) {
    var i = keys.indexOf(val);
    if (i >= 0) return colors[i];
    return val && otherColor ? otherColor : null;
  };
};

internal.validateSequentialBreaks = function(breaks) {
  // Accepts repeated values -- should this be allowed?
  var arr2 = breaks.map(parseFloat);
  utils.genericSort(arr2);
  for (var i=0; i<breaks.length; i++) {
    if (breaks[i] !== arr2[i]) stop('Invalid class breaks:', breaks.join(','));
  }
};

internal.getSequentialColorFunction = function(colors, breaks, round) {
  if (colors.length != breaks.length + 1) {
    stop("Number of colors should be one more than number of class breaks");
  }
  internal.validateSequentialBreaks(breaks);
  return function(val) {
    var i = -1;
    if (round) val = val(round);
    i = utils.getClassId(val, breaks);
    return i > -1 && i < colors.length ? colors[i] : null;
  };
};

utils.getClassId = function(val, breaks) {
  var id = -1;
  if (!isNaN(val)) {
    id = 0;
    for (var j = 0, len=breaks.length; j < len; j++) {
      var breakVal = breaks[j];
      if (val < breakVal) {
        break;
      }
      id = j + 1;
    }
  }
  return id;
};
