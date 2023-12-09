import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { parsePattern } from '../svg/svg-hatch';

// parsing hints for -style command cli options
// null values indicate the lack of a function for parsing/identifying this property
// (in which case a heuristic is used for distinguishing a string literal from an expression)
var stylePropertyTypes = {
  // css: null,
  css: 'inlinecss',
  class: 'classname',
  dx: 'measure',
  dy: 'measure',
  fill: 'color',
  'fill-pattern': 'pattern',
  'fill-effect': null, // todo: validate effect names
  'font-family': null,
  'font-size': null,
  'font-style': null,
  'font-weight': null,
  'label-text': null,  // leaving this null
  'letter-spacing': 'measure',
  'line-height': 'measure',
  opacity: 'number',
  r: 'number',
  stroke: 'color',
  'stroke-dasharray': 'dasharray',
  'stroke-width': 'number',
  'stroke-opacity': 'number',
  'stroke-miterlimit': 'number',
  'fill-opacity': 'number',
  'vector-effect': null,
  'text-anchor': null
};

// The -symbols command accepts some options that are not supported by -style
// (different symbol types accept different combinations of properties...)
var symbolPropertyTypes = utils.extend({
  type: null,
  length: 'number', // e.g. arrow length
  rotation: 'number',
  radius: 'number',
  radii: null, // string, parsed by function
  flipped: 'boolean',
  rotated: 'boolean',
  direction: 'number',
  sides: 'number', // polygons and stars
  points: 'number', // polygons and stars
  anchor: null, // arrows; takes start, middle, end
  'head-angle': 'number',
  'head-width': 'number',
  'head-length': 'number',
  'stem-width': 'number',
  'stem-curve': 'number', // degrees of arc
  'stem-taper': 'number',
  'stem-length': 'number',
  'min-stem-ratio': 'number',
  'arrow-scaling': 'number',
  effect: null // e.g. "fade"
}, stylePropertyTypes);

var commonProperties = 'css,class,opacity,stroke,stroke-width,stroke-dasharray,stroke-opacity,fill-opacity,vector-effect'.split(',');

var propertiesBySymbolType = {
  polygon: utils.arrayToIndex(commonProperties.concat('fill', 'fill-pattern', 'fill-effect')),
  polyline: utils.arrayToIndex(commonProperties.concat('stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit')),
  point: utils.arrayToIndex(commonProperties.concat('fill', 'r')),
  label: utils.arrayToIndex(commonProperties.concat(
    'fill,font-family,font-size,text-anchor,font-weight,font-style,letter-spacing,dominant-baseline'.split(',')))
};

// symType: point, polygon, polyline, label
export function applyStyleAttributes(svgObj, symType, rec, filter) {
  var fields = findPropertiesBySymbolGeom(Object.keys(rec || {}), symType);
  for (var i=0, n=fields.length; i<n; i++) {
    if (filter && !filter(fields[i])) continue;
    setAttribute(svgObj, fields[i], rec[fields[i]]);
  }
}

function setAttribute(obj, k, v) {
  if (!obj.properties) obj.properties = {};
  obj.properties[k] = v;
  if (k == 'stroke-dasharray' && v) {
    // kludge for cleaner dashes... make butt the default?
    obj.properties['stroke-linecap'] = 'butt';
  }
}

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
  var fields = lyr.data ? lyr.data.getFields() : [];

  Object.keys(opts).forEach(function(optName) {
    var svgName = optName.replace(/_/g, '-');
    if (!isSupportedSvgSymbolProperty(svgName)) {
      return;
    }
    var val = opts[optName];
    functions[svgName] = getSymbolPropertyAccessor(val, svgName, lyr);
    properties.push(svgName);
  });

  // TODO: consider applying values of existing fields with names of symbol properties

  return function(id) {
    var d = {}, name;
    for (var i=0; i<properties.length; i++) {
      name = properties[i];
      d[name] = functions[name](id);
    }
    return d;
  };
}

// need a test that identifies any expression but doesn't get triggered by:
// * invalid patterns: dots 45deg black 3px red
// * ???
//
export function mightBeExpression(str, fields) {
  fields = fields || [];
  if (fields.indexOf(str.trim()) > -1) return true;
  return /[(){}./*?:&|=[+-]/.test(str);
}

export function getSymbolPropertyAccessor(val, svgName, lyr) {
  var strVal = String(val).trim();
  var typeHint = symbolPropertyTypes[svgName];
  var fields = lyr.data ? lyr.data.getFields() : [];
  var literalVal = null;
  var accessor;

  if (typeHint && fields.indexOf(strVal) === -1) {
    literalVal = parseSvgLiteralValue(strVal, typeHint);
  }
  if (literalVal === null && mightBeExpression(strVal, fields)) {
    accessor = parseStyleExpression(strVal, lyr); // no longer throws an error
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
    func = compileFeatureExpression(strVal, lyr, null, {no_warn: true});
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
  } else if (type == 'pattern') {
    val = isPattern(strVal) ? strVal : null;
  } else if (type == 'boolean') {
    val = parseBoolean(strVal);
  } else if (type == 'inlinecss') {
    val = strVal; // TODO: validate
  }
  //  else {
  //   // unknown type -- assume literal value
  //   val = strVal;
  // }
  return val;
}

function isPattern(str) {
  return !!parsePattern(str);
}

function isDashArray(str) {
  return /^[0-9]+( [0-9]+)*$/.test(str);
}

export function isSvgClassName(str) {
  return /^( ?[_a-z][-_a-z0-9]*\b)+$/i.test(str);
}


export function isSvgNumber(o) {
  return utils.isFiniteNumber(o) || utils.isString(o) && /^-?[.0-9]+$/.test(o);
}

export function parseBoolean(o) {
  if (o === true || o === 'true') return true;
  if (o === false || o === 'false') return false;
  return null;
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
