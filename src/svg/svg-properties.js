import { compileValueExpression } from '../expressions/mapshaper-expressions';
import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { getStateVar } from '../mapshaper-state';

// parsing hints for -style command cli options
// null values indicate the lack of a function for parsing/identifying this property
// (in which case a heuristic is used for distinguishing a string literal from an expression)
var stylePropertyTypes = {
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
var symbolPropertyTypes = utils.extend({
  type: null,
  length: 'number', // e.g. arrow length
  rotation: 'number',
  curve: 'number', // degrees of arc
  effect: null // e.g. "fade"

}, stylePropertyTypes);

var commonProperties = 'class,opacity,stroke,stroke-width,stroke-dasharray'.split(',');

var propertiesBySymbolType = {
  polygon: utils.arrayToIndex(commonProperties.concat('fill')),
  polyline: utils.arrayToIndex(commonProperties),
  point: utils.arrayToIndex(commonProperties.concat('fill', 'r')),
  label: utils.arrayToIndex(commonProperties.concat(
    'fill,r,font-family,font-size,text-anchor,font-weight,font-style,letter-spacing,dominant-baseline'.split(',')))
};

export function isSupportedSvgStyleProperty(name) {
  return name in stylePropertyTypes;
}

function isSupportedSvgSymbolProperty(name) {
  return name in symbolPropertyTypes;
}

export function findPropertiesBySymbolGeom(fields, type) {
  var index = propertiesBySymbolType[type] || {};
  return fields.filter(function(name) {
    return name in index;
  });
}

// Returns a function that returns an object containing property values for a single record
// opts: parsed command line options for the -symbols command
//
export function getSymbolDataAccessor(lyr, opts) {
  var functions = {};
  var properties = [];

  Object.keys(opts).forEach(function(optName) {
    var svgName = optName.replace('_', '-');
    if (!isSupportedSvgSymbolProperty(svgName)) {
      return;
    }
    var strVal = opts[optName].trim();
    functions[svgName] = getSymbolPropertyAccessor(strVal, svgName, lyr);
    properties.push(svgName);
  });

  return function(id) {
    var d = {}, name;
    for (var i=0; i<properties.length; i++) {
      name = properties[i];
      d[name] = functions[name](id);
    }
    return d;
  };
}

export function getSymbolPropertyAccessor(strVal, svgName, lyr) {
  var typeHint = symbolPropertyTypes[svgName];
  var fields = lyr.data ? lyr.data.getFields() : [];
  var literalVal = null;
  var accessor;

  if (typeHint && fields.indexOf(strVal) === -1) {
    literalVal = parseSvgLiteralValue(strVal, typeHint);
  }
  if (literalVal === null) {
    accessor = parseStyleExpression(strVal, lyr);
  }
  if (!accessor && literalVal === null && !typeHint) {
    // We don't have a type rule for detecting an invalid value, so we're
    // treating the string as a literal value
    literalVal = strVal;
  }
  if (accessor) return accessor;
  if (literalVal !== null) return function(id) {return literalVal;};
  stop('Unexpected value for', svgName + ':', strVal);
}

function parseStyleExpression(strVal, lyr) {
  var func;
  try {
    func = compileValueExpression(strVal, lyr, null, {context: getStateVar('defs'), quiet: true});
    func(0); // check for runtime errors (e.g. undefined variables)
  } catch(e) {
    func = null;
  }
  return func;
}

// returns parsed value or null if @strVal is not recognized as a valid literal value
function parseSvgLiteralValue(strVal, type) {
  var val = null;
  if (type == 'number') {
    // TODO: handle values with units, like "13px"
    val = isSvgNumber(strVal) ? Number(strVal) : null;
  } else if (type == 'color') {
    val = isSvgColor(strVal) ? strVal : null;
  } else if (type == 'classname') {
    val = isSvgClassName(strVal) ? strVal : null;
  } else if (type == 'measure') { // SVG/CSS length (e.g. 12px, 1em, 4)
    val = isSvgMeasure(strVal) ? parseSvgMeasure(strVal) : null;
  } else if (type == 'dasharray') {
    val = isDashArray(strVal) ? strVal : null;
  }
  //  else {
  //   // unknown type -- assume literal value
  //   val = strVal;
  // }
  return val;
}

export function isDashArray(str) {
  return /^[0-9]+( [0-9]+)*$/.test(str);
}

export function isSvgClassName(str) {
  return /^( ?[_a-z][-_a-z0-9]*\b)+$/i.test(str);
}

export function isSvgNumber(o) {
  return utils.isFiniteNumber(o) || utils.isString(o) && /^-?[.0-9]+$/.test(o);
}

export function isSvgMeasure(o) {
  return utils.isFiniteNumber(o) || utils.isString(o) && /^-?[.0-9]+[a-z]*$/.test(o);
}

// Can be a number or a string
export function parseSvgMeasure(str) {
  return utils.isString(str) && /[a-z]/.test(str) ? str : Number(str);
}

export function isSvgColor(str) {
  return /^[a-z]+$/i.test(str) ||
    /^#[0-9a-f]+$/i.test(str) || /^rgba?\([0-9,. ]+\)$/.test(str);
}
