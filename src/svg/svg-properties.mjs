import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { splitListItems } from '../cli/mapshaper-option-parsing-utils';
import utils from '../utils/mapshaper-utils';
import { stop } from '../utils/mapshaper-logging';
import { parsePattern } from '../svg/svg-hatch';
import { parseLabelAlign, getAlignmentAnchor } from '../svg/svg-label-align';

// parsing hints for -style command cli options
// null values indicate the lack of a function for parsing/identifying this property
// (in which case a heuristic is used for distinguishing a string literal from an expression)
var stylePropertyTypes = {
  // css: null,
  css: 'inlinecss',
  class: 'classname',
  'dominant-baseline': null,
  dx: 'measure',
  dy: 'measure',
  fill: 'color',
  'fill-pattern': 'pattern',
  'fill-effect': null, // todo: validate effect names
  'font-family': null,
  'font-size': null,
  'font-style': null,
  'font-stretch': null,
  'font-weight': null,
  // a stroke around a label's text, painted beneath it -- see svg-label-halo.mjs
  'halo-color': 'color',
  'halo-opacity': 'number',
  'halo-width': 'number',
  icon: null,
  'icon-color': 'color',
  // opacity of the symbol at a label's anchor, apart from the text's. Needed
  // because a label's own opacity properties are applied to both of the
  // elements its record produces -- see getIconStyleData().
  'icon-opacity': 'number',
  'icon-size': 'number',
  // how the lines of a multi-line label line up with each other, as against
  // text-anchor, which also decides where the block of them sits -- see
  // svg-label-align.mjs
  'label-align': 'labelalign',
  'label-pos': 'labelposition',
  // which side of its path a label's text sits on
  'label-side': null,
  // where the text starts along its path; a length or a percentage
  'label-start-offset': null,
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

// Properties an empty string is a value for rather than the absence of one:
// the text of a label, which is empty while it is being typed, and the two
// that take any string at all. See emptyValueUnsetsProperty().
var propertiesTakingEmptyValues = {
  'label-text': true,
  css: true,
  class: true
};

// The -symbols command accepts some options that are not supported by -style
// (different symbol types accept different combinations of properties...)
var symbolPropertyTypes = utils.extend({
  type: null,
  length: 'number', // e.g. arrow length
  rotation: 'number',
  radius: 'number',
  radii: null, // (ring) list, see symbolListProperties
  hole: 'number', // (pie) radius of the hole in a donut
  values: null, // (pie) list, see symbolListProperties
  fills: null, // (pie) list, see symbolListProperties
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

// Options that take a list of values -- one for each part of a multi-part
// symbol -- instead of a single value. Each item in the list is resolved
// separately, so an item can be a literal value, a field name or an
// expression. The type hint for fills= is null on purpose: an item that isn't
// a recognizable color is passed along as a literal string, so that a symbol
// can leave that part unfilled instead of the command failing.
var symbolListProperties = {
  radii: 'number',
  values: 'number',
  fills: null
};

var commonProperties = 'css,class,opacity,stroke,stroke-width,stroke-dasharray,stroke-opacity,fill-opacity,vector-effect'.split(',');

var propertiesBySymbolType = {
  polygon: utils.arrayToIndex(commonProperties.concat('fill', 'fill-pattern', 'fill-effect')),
  polyline: utils.arrayToIndex(commonProperties.concat('stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit')),
  point: utils.arrayToIndex(commonProperties.concat('fill', 'r')),
  label: utils.arrayToIndex(commonProperties.concat(
    'fill,font-family,font-size,text-anchor,font-weight,font-style,font-stretch,letter-spacing,dominant-baseline'.split(',')))
};

// The properties a label position stands for, and the shorthand itself.
export var labelPositionDerivedFields = ['dx', 'dy', 'text-anchor'];
export var labelPositionFields = ['label-pos'].concat(labelPositionDerivedFields);

// dx is '0' and not 0 in the centred positions, so that every position in the
// table has the same type. These values are normally resolved for rendering and
// never stored, but dragging a label materializes them into its record, and a
// column holding 0 from one position and '0.45em' from another is one
// -merge-layers refuses.
var labelPositionStyles = {
  n: {dx: '0', dy: '-0.5em', 'text-anchor': 'middle'},
  s: {dx: '0', dy: '1.1em', 'text-anchor': 'middle'},
  e: {dx: '0.45em', dy: '0.23em', 'text-anchor': 'start'},
  w: {dx: '-0.45em', dy: '0.23em', 'text-anchor': 'end'},
  ne: {dx: '0.4em', dy: '-0.15em', 'text-anchor': 'start'},
  se: {dx: '0.4em', dy: '0.7em', 'text-anchor': 'start'},
  nw: {dx: '-0.4em', dy: '-0.15em', 'text-anchor': 'end'},
  sw: {dx: '-0.4em', dy: '0.7em', 'text-anchor': 'end'},
  c: {dx: '0', dy: '0.25em', 'text-anchor': 'middle'}
};

// symType: point, polygon, polyline, label
export function applyStyleAttributes(svgObj, symType, rec, filter) {
  var fields = findStylePropertiesBySymbolGeom(Object.keys(rec || {}), symType);
  for (var i=0, n=fields.length; i<n; i++) {
    if (filter && !filter(fields[i])) continue;
    setAttribute(svgObj, fields[i], rec[fields[i]]);
  }
  // kludge to prevent default black fill on polygons with stroke styles
  if ((symType == 'polygon' || symType == 'circle') && rec.stroke && !rec.fill) {
    setAttribute(svgObj, 'fill', 'none');
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

// Whether an empty value removes this property rather than being stored in it.
//
// True for a property with no empty value to store, like a number, a color or a
// font weight: -style fill= takes the fill back off a feature, where it used to
// be an error. It is the only per-property unset there is -- -style clear
// removes every style property at once -- and the panel needs one, since a
// control returning to its default has to be able to say so.
//
// False where the empty string is itself a value: inline css, a class name, and
// the text of a label, which is empty while it is being typed. Everything else
// with no type rule -- a font family, a text-anchor, an icon name -- has no
// meaning for an empty string either, so storing one there would leave a column
// of nothing behind and an attribute the renderer has to ignore.
export function emptyValueUnsetsProperty(name) {
  if (!(name in stylePropertyTypes) || name in propertiesTakingEmptyValues) {
    return false;
  }
  var type = stylePropertyTypes[name];
  return !type || parseSvgLiteralValue('', type) === null;
}

// Converts a style value to the type that property is stored in -- the same
// conversion -style applies to a literal. Returns undefined if the value is not
// usable for the property, and the value unchanged for a property with no type
// rule, where any string is a literal.
//
// -style resolves a value three ways: as a literal, as the name of a data field
// or as an expression over the feature. A command that sets properties on a
// single feature it is creating has no feature to read a field from, so it
// wants the first of those on its own -- but it has to agree with -style about
// the result, or the same value given to the two commands ends up stored as two
// different types in one column.
export function parseStyleLiteral(name, val) {
  var type = stylePropertyTypes[name];
  var parsed;
  if (!type) return val; // no rule for this property: the value is the value
  parsed = parseSvgLiteralValue(String(val).trim(), type);
  return parsed === null ? undefined : parsed;
}

function isSupportedSvgSymbolProperty(name) {
  return name in symbolPropertyTypes;
}

export function findStylePropertiesBySymbolGeom(fields, type) {
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
    functions[svgName] = svgName in symbolListProperties ?
      getSymbolListAccessor(val, svgName, lyr) :
      getSymbolPropertyAccessor(val, svgName, lyr);
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
  return getPropertyAccessor(val, symbolPropertyTypes[svgName], lyr, svgName);
}

// Returns a function that maps a feature id to an array of values, for options
// like values= and fills= that describe the parts of a multi-part symbol.
// The option may be given as an array or as a comma-separated list.
export function getSymbolListAccessor(val, svgName, lyr) {
  var typeHint = symbolListProperties[svgName];
  var items = Array.isArray(val) ? val : splitListItems(String(val));
  var accessors = items.map(function(item) {
    return getPropertyAccessor(item, typeHint, lyr, svgName);
  });
  return function(id) {
    return accessors.map(function(accessor) {
      return accessor(id);
    });
  };
}
// Returns a function that maps a feature id to a property value. The value may
// be given as a literal, as the name of a data field, or as a JS expression
// evaluated against each feature.
// typeHint: a type understood by parseSvgLiteralValue(), or null to accept any
//   string as a literal value
// name: used in error messages
// Callers outside the SVG property system pass a type hint directly, rather
// than registering an option name in symbolPropertyTypes -- that index also
// decides which options the -symbols command treats as symbol properties.
export function getPropertyAccessor(val, typeHint, lyr, name) {
  var strVal = String(val).trim();
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
  stop('Unexpected value for', name + ':', strVal);
}

// Whether @strVal works as an expression, and the function if it does.
//
// This is a guess being checked, so the failures are expected and have to be
// silent: quiet keeps the expression compiler from reporting them, which in
// the GUI means an alert over a style change that went on to work perfectly
// well -- a label typed as "Saint-Denis" or an offset of "59.77%" is not an
// expression, and neither is an error.
function parseStyleExpression(strVal, lyr) {
  var func;
  try {
    func = compileFeatureExpression(strVal, lyr, null,
      {no_warn: true, quiet: true});
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
  } else if (type == 'labelposition') {
    val = parseLabelPosition(strVal);
  } else if (type == 'labelalign') {
    val = parseLabelAlign(strVal);
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

export function parseLabelPosition(str) {
  var pos = String(str).trim();
  return /^(n|s|e|w|ne|se|nw|sw|c)$/i.test(pos) ? pos : null;
}

export function getLabelPositionStyle(pos) {
  pos = parseLabelPosition(pos);
  if (!pos) return null;
  return Object.assign({'label-pos': pos}, labelPositionStyles[pos.toLowerCase()]);
}

// Fills in the offsets and justification a label's position stands for, for
// rendering. Returns @rec itself when there is nothing to add, and a copy when
// there is: a renderer must not write into the record it was handed.
//
// label-pos is the only one of the four that is stored. The other three used to
// be written alongside it, which made the table below a code generator rather
// than a lookup: four columns in the user's data where one was meant, and the
// table's own values -- '0' next to '0.45em' -- became the types of a column
// that -merge-layers then had to agree about.
//
// A value on the record wins over the position, per property, so that
// `label-pos=n dx=3` reads as "north, nudged 3px right" rather than losing the
// north. That is also what makes this change invisible to files written before
// it: they carry all three alongside label-pos, with exactly the values this
// would supply.
export function resolveLabelPosition(rec) {
  var style = rec && rec['label-pos'] ? getLabelPositionStyle(rec['label-pos']) : null;
  var out = null;
  var field, i;
  // An unusable position renders as if it were unset. The commands that set it
  // reject one, so reaching here means it was written by an expression or came
  // from a data file, where stopping the render is the wrong response.
  if (style) {
    for (i = 0; i < labelPositionDerivedFields.length; i++) {
      field = labelPositionDerivedFields[i];
      if (hasStyleValue(rec, field)) continue;
      if (!out) out = Object.assign({}, rec);
      out[field] = style[field];
    }
  }
  out = resolveLabelAlignment(out || rec) || out;
  return out || rec;
}

// label-align wins over both the position's justification and a text-anchor of
// the record's own, because it is the only one of the three that is asking
// about justification alone. Where the block ends up is then the renderer's to
// correct -- see getAlignmentShift().
function resolveLabelAlignment(rec) {
  var anchor = getAlignmentAnchor(rec['label-align']);
  var out;
  if (!anchor || rec['text-anchor'] === anchor) return null;
  out = Object.assign({}, rec);
  out['text-anchor'] = anchor;
  return out;
}

// The anchor a label's position implies, which is where its block of text is
// drawn whatever the lines inside it do. 'start' is both the SVG default and
// what an unpositioned label is drawn with.
export function getLabelPositionAnchor(rec) {
  var style = rec && rec['label-pos'] ? getLabelPositionStyle(rec['label-pos']) : null;
  return style && style['text-anchor'] || 'start';
}

// Presence, not truthiness. `dy=0` is how a label cancels the vertical offset
// its position carries, and the `rec.dy || 0` idiom used by the renderers would
// read that as absent and hand back the offset it was written to remove.
export function hasStyleValue(rec, field) {
  var val = rec[field];
  return field in rec && val !== undefined && val !== null && val !== '';
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
