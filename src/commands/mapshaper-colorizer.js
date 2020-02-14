/* @requires mapshaper-rounding */

api.colorizer = function(opts) {
  if (!opts.name) {
    stop("Missing required name= parameter");
  }
  if (internal.isReservedName(opts.name)) {
    stop('"' + opts.name + '" is a reserved name');
  }
  internal.getStateVar('defs')[opts.name] = internal.getColorizerFunction(opts);
};

internal.isReservedName = function(name) {
  return /^(stroke|stroke-width|stroke-dasharray|fill|opacity|r|class)$/.test(name);
};

internal.getColorizerFunction = function(opts) {
  var nodataColor = opts.nodata || 'white';
  var round = opts.precision ? utils.getRoundingFunction(opts.precision) : null;
  var colorFunction;

  if (!opts.random && (!opts.colors || !opts.colors.length)) {
    stop("Missing colors= parameter");
  }

  if (opts.random) {
    colorFunction = internal.getRandomColorFunction(opts.colors);
  } else if (opts.breaks) {
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

internal.fastStringHash = function(val) {
  // based on https://github.com/darkskyapp/string-hash (public domain)
  var str = String(val),
      hash = 5381,
      i = str.length;
  while (i > 0) {
    hash = (hash * 33) ^ str.charCodeAt(--i);
  }
  return Math.abs(hash);
};

internal.getRandomColorFunction = function(colors) {
  if (!colors || !colors.length) {
    colors = '#ccc,#888,#444'.split(',');
  }
  return function(val) {
    var n = colors.length;
    var i = val === undefined ?
        Math.floor(Math.random() * n) : internal.fastStringHash(val) % n;
    return colors[i];
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
    if (Number(val) === val) { // exclude null, NaN, strings, etc.
      if (round) val = val(round);
      i = utils.getClassId(val, breaks);
    }
    return i > -1 && i < colors.length ? colors[i] : null;
  };
};

// breaks: threshold values between ranges (ascending order)
// Returns array index of a sequential range, or -1 if @val not numeric
utils.getClassId = function(val, breaks) {
  var minVal = -Infinity,
      maxVal = Infinity,
      i = 0;
  if (!(val >= minVal && val <= maxVal)) {
    return -1;
  }
  while (i < breaks.length && val >= breaks[i]) i++;
  return i;
};
