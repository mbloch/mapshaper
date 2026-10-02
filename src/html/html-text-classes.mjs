import { addFontFallbacks } from './html-font-stacks';

// Text styles in HTML output are written as CSS classes rather than as
// attributes on each label: one class for each combination of style properties
// in the map, so that a page can restyle a map's labels by editing a few rules.

var TEXT_TAGS = {text: true, tspan: true, textPath: true};

var TEXT_STYLE_PROPERTIES = [
  'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch',
  'letter-spacing', 'text-anchor', 'dominant-baseline', 'fill', 'fill-opacity',
  'opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linejoin', 'paint-order'
];

// The text defaults a layer's group carries for its labels to inherit (see
// getLabelTextDefaults()), which are folded into the labels' own classes.
var LAYER_TEXT_PROPERTIES = ['font-family', 'font-size', 'text-anchor'];

// A bare number is px in an SVG attribute, and not valid CSS for these.
var LENGTH_PROPERTIES = {'font-size': true, 'letter-spacing': true, 'stroke-width': true};

// Moves the text style properties of the elements in @layers (SVG objects, one
// per layer) into classes named @prefix + n. Returns the classes in the order
// they were first used: [{name, style: {property: value, ...}}, ...]
export function convertTextStylesToClasses(layers, prefix) {
  var classes = [];
  var index = {};
  layers.forEach(function(lyr) {
    var inherited = moveProperties(lyr.properties, {}, LAYER_TEXT_PROPERTIES);
    procNode(lyr, inherited, false);
  });
  return classes;

  function procNode(node, inherited, inText) {
    var style, name;
    if (TEXT_TAGS[node.tag]) {
      // text inside a text element inherits from it, not from the layer
      style = Object.assign({}, inText ? null : inherited);
      moveProperties(node.properties, style, TEXT_STYLE_PROPERTIES);
      if (Object.keys(style).length > 0) {
        name = getClassName(style);
        node.properties.class = node.properties.class ?
          node.properties.class + ' ' + name : name;
      }
      inText = true;
    }
    (node.children || []).forEach(function(child) {
      procNode(child, inherited, inText);
    });
  }

  function getClassName(style) {
    var key = getStyleKey(style);
    if (!(key in index)) {
      index[key] = prefix + classes.length;
      classes.push({name: index[key], style: style});
    }
    return index[key];
  }
}

// Returns CSS rules for @classes, scoped to @selector
export function formatTextClassesAsCss(classes, selector) {
  return classes.map(function(o) {
    var decl = Object.keys(o.style).map(function(k) {
      return k + ':' + formatCssValue(k, o.style[k]) + ';';
    }).join('');
    return selector + ' .' + o.name + ' {' + decl + '}';
  }).join('\n');
}

function formatCssValue(name, val) {
  var str = sanitizeCssValue(val);
  if (LENGTH_PROPERTIES[name] && /^-?(\d+\.?\d*|\.\d+)$/.test(str)) {
    str += 'px';
  } else if (name == 'font-family') {
    str = addFontFallbacks(str);
  }
  return str;
}

// Values come from data, and must not be able to end the declaration, the
// rule or the <style> element they are written into.
function sanitizeCssValue(val) {
  return String(val).replace(/[{}<>;\\]/g, '').trim();
}

function getStyleKey(style) {
  return Object.keys(style).sort().map(function(k) {
    return k + ':' + style[k];
  }).join(';');
}

function moveProperties(src, dest, names) {
  if (!src) return dest;
  names.forEach(function(k) {
    var val = src[k];
    delete src[k];
    // stringify() omits these, so they are not style
    if (!val && val !== 0) return;
    dest[k] = val;
  });
  return dest;
}
