/* @requires svg-common */

// parsing hints for -style command cli options
// null values indicate the lack of a function for parsing/identifying this property
SVG.stylePropertyTypes = {
  class: 'classname',
  dx: 'measure',
  dy: 'measure',
  fill: 'color',
  'font-family': null,
  'font-size': null,
  'font-style': null,
  'font-weight': null,
  'label-text': null,  // not a CSS property
  'letter-spacing': 'measure',
  'line-height': 'measure',
  opacity: 'number',
  r: 'number',
  stroke: 'color',
  'stroke-dasharray': 'dasharray',
  'stroke-width': 'number',
  'text-anchor': null
};

// The -symbols command accepts some options that are not supported by -style
// (different symbol types accept different combinations of properties...)
SVG.symbolPropertyTypes = utils.extend({
  type: null,
  length: 'number', // e.g. arrow length
  rotation: 'number'

}, SVG.stylePropertyTypes);

// SVG.supportedProperties = 'class,opacity,stroke,stroke-width,stroke-dasharray,fill,r,dx,dy,font-family,font-size,text-anchor,font-weight,font-style,line-height,letter-spacing'.split(',');
SVG.commonProperties = 'class,opacity,stroke,stroke-width,stroke-dasharray'.split(',');

SVG.propertiesBySymbolType = {
  polygon: utils.arrayToIndex(SVG.commonProperties.concat('fill')),
  polyline: utils.arrayToIndex(SVG.commonProperties),
  point: utils.arrayToIndex(SVG.commonProperties.concat('fill', 'r')),
  label: utils.arrayToIndex(SVG.commonProperties.concat(
    'fill,r,font-family,font-size,text-anchor,font-weight,font-style,letter-spacing,dominant-baseline'.split(',')))
};

SVG.isSupportedSvgStyleProperty = function(name) {
  return name in SVG.stylePropertyTypes;
};

SVG.isSupportedSvgSymbolProperty = function(name) {
  return name in SVG.symbolPropertyTypes;
};

SVG.findPropertiesBySymbolGeom = function(fields, type) {
  var index = SVG.propertiesBySymbolType[type] || {};
  return fields.filter(function(name) {
    return name in index;
  });
};

// Returns a function that returns an object containing property values for a single record
// opts: parsed command line options for the -symbols command
//
internal.getSymbolPropertyAccessor = function(lyr, opts) {
  var literals = {};
  var functions = {};
  var properties = [];

  Object.keys(opts).forEach(function(optName) {
    var literalVal, strVal, dataType;
    var svgName = optName.replace('_', '-');
    if (!SVG.isSupportedSvgSymbolProperty(svgName)) {
      return;
    }
    dataType = SVG.symbolPropertyTypes[svgName];
    strVal = opts[optName].trim();
    literalVal = internal.parseSvgLiteralValue(strVal, dataType, lyr.data.getFields());
    if (literalVal === null) { // not parsed as a literal value, assuming JS expression
      functions[svgName] = internal.compileValueExpression(strVal, lyr, null, {context: internal.getStateVar('defs')});
    } else {
      literals[svgName] = literalVal;
    }
    properties.push(svgName);
  });

  return function(id) {
    var d = {}, name;
    for (var i=0; i<properties.length; i++) {
      name = properties[i];
      d[name] = name in functions ? functions[name](id) : literals[name];
    }
    return d;
  };
};

// returns parsed value or null if @strVal is not recognized as a valid literal value
internal.parseSvgLiteralValue = function(strVal, type, fields) {
  var val;
  if (fields.indexOf(strVal) > -1) {
    val = null; // field names are valid expressions
  } else if (type == 'number') {
    // TODO: handle values with units, like "13px"
    val = internal.isSvgNumber(strVal) ? Number(strVal) : null;
  } else if (type == 'color') {
    val = internal.isSvgColor(strVal) ? strVal : null;
  } else if (type == 'classname') {
    val = internal.isSvgClassName(strVal) ? strVal : null;
  } else if (type == 'measure') { // SVG/CSS length (e.g. 12px, 1em, 4)
    val = internal.isSvgMeasure(strVal) ? internal.parseSvgMeasure(strVal) : null;
  } else if (type == 'dasharray') {
    val = internal.isDashArray(strVal) ? strVal : null;
  } else {
    // unknown type -- assume string is an expression if JS syntax chars are found
    // (but not chars like <sp> and ',', which may be in a font-family, e.g.)
    val = /[\?\:\[\(\+]/.test(strVal) ? null : strVal; //
  }
  return val;
};

internal.isDashArray = function(str) {
  return /^[0-9]+( [0-9]+)*$/.test(str);
};

internal.isSvgClassName = function(str) {
  return /^( ?[_a-z][-_a-z0-9]*\b)+$/i.test(str);
};

internal.isSvgNumber = function(o) {
  return utils.isFiniteNumber(o) || utils.isString(o) && /^-?[.0-9]+$/.test(o);
};

internal.isSvgMeasure = function(o) {
  return utils.isFiniteNumber(o) || utils.isString(o) && /^-?[.0-9]+[a-z]*$/.test(o);
};

// Can be a number or a string
internal.parseSvgMeasure = function(str) {
  return utils.isString(str) && /[a-z]/.test(str) ? str : Number(str);
};

internal.isSvgColor = function(str) {
  return /^[a-z]+$/i.test(str) ||
    /^#[0-9a-f]+$/i.test(str) || /^rgba?\([0-9,. ]+\)$/.test(str);
};
