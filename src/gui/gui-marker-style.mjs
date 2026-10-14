import { quoteCommandValue } from './gui-command-utils';
import { encodeLabelText } from './gui-label-text';
import { getRestyleIconOptions } from './gui-symbol-style';

// A numbered marker -- a circle or square with a number or letter centred in
// it -- as the symbol panel models it. In the data it is one label record:
// label-text, label-pos=c and the text's font and fill, with the symbol behind
// it in icon=, icon-size=, icon-fill= and the rest. The symbol panel restyles
// its symbol with -symbols ids=, which keeps the text, and its text with
// -labels ids=. Pure functions, so that they can be tested without a map.
//
// See docs/development/symbol-tool-design.md.

// The shapes a marker can have: the ones with room in the middle for text
export var MARKER_SHAPES = ['circle', 'square'];

// A symbol given text at a size too small for it -- the default 10px is --
// grows to this
export var MARKER_SIZE = 20;
var MIN_MARKER_SIZE = 16;

export function shapeTakesText(shape) {
  return MARKER_SHAPES.indexOf(shape) > -1;
}

// The size a symbol of @size has once it is given text
export function getMarkerIconSize(size) {
  return size >= MIN_MARKER_SIZE ? size : MARKER_SIZE;
}

// The panel's text style: {text, font, style, weight, size, color, baseline},
// where text is '' for a symbol with no text, font is '' until the panel picks
// the font new labels get, and baseline is the text's baseline below the
// symbol's centre in px, or '' for where the font's capitals are centred.
export function getDefaultMarkerTextStyle() {
  return {text: '', font: '', style: 'normal', weight: '700', size: 12,
    color: '#ffffff', baseline: ''};
}

// The record fields that put @text (a panel text style) on a symbol, apart
// from label-text itself. Regular is no face at all, as in the label panel.
//
// The baseline is stored in em, so that it scales with the type: a marker set
// a size larger keeps its number where it was in the symbol.
export function getMarkerTextFields(text) {
  var o = {'label-pos': 'c'};
  if (text.font) o['font-family'] = text.font;
  o['font-size'] = text.size;
  if (!isRegular(text.style, text.weight)) {
    o['font-style'] = text.style;
    o['font-weight'] = text.weight;
  }
  o.fill = text.color || '#000000';
  if (text.baseline !== '' && isFinite(text.baseline)) {
    o.dy = getBaselineEm(text.baseline, text.size);
  }
  return o;
}

// The panel text style of the marker in @rec
export function getMarkerTextStyle(rec) {
  var size = Number(rec['font-size']) > 0 ? Number(rec['font-size']) : 12;
  return {
    text: String(rec['label-text'] || ''),
    font: rec['font-family'] || '',
    style: rec['font-style'] || 'normal',
    weight: String(rec['font-weight'] || '400'),
    size: size,
    color: rec.fill || '',
    baseline: parseBaseline(rec.dy, size)
  };
}

// A baseline in px as dy= in em, to three places
export function getBaselineEm(px, size) {
  return Math.round(Number(px) / size * 1000) / 1000 + 'em';
}

// dy as a baseline in px, to a tenth: a number is px, and em is the font size.
// '' for no dy, or one in units the panel does not show.
export function parseBaseline(dy, size) {
  var str = dy === undefined || dy === null ? '' : String(dy).trim();
  var m;
  if (str === '') return '';
  m = /^(-?[0-9.]+)(em|px)?$/.exec(str);
  if (!m || !isFinite(Number(m[1]))) return '';
  return Math.round(Number(m[1]) * (m[2] == 'em' ? size : 1) * 10) / 10;
}

// The -labels fields that place a marker of @icon (a panel symbol style) with
// @text on it: the symbol in the icon fields -symbols writes on a label.
export function getAddMarkerFields(icon, text) {
  var o = getMarkerTextFields(text);
  o.icon = icon.shape;
  o['icon-size'] = icon.size;
  o['icon-fill'] = icon.fill || 'none';
  if (icon.stroke && icon.strokeWidth > 0) {
    o['icon-stroke'] = icon.stroke;
    o['icon-stroke-width'] = icon.strokeWidth;
  }
  if (icon.shape == 'square' && icon.rotation) o['icon-rotation'] = icon.rotation;
  return o;
}

// What auto-numbering puts on the next marker after one with @text: the next
// number, or the next letter. Other text, and a Z, repeats.
export function getNextMarkerText(text) {
  var str = String(text);
  var code;
  if (/^[0-9]+$/.test(str)) return String(Number(str) + 1);
  if (/^[A-Ya-y]$/.test(str)) {
    code = str.charCodeAt(0);
    return String.fromCharCode(code + 1);
  }
  return str;
}

// Where counting starts when it is turned on with @text in the field: the
// text itself if no marker has it yet, otherwise the next number or letter
// that none has, so that the next symbol placed is not a second of one that
// was already placed. @used: the text of the markers in the layer.
export function getAutoNumberStart(text, used) {
  var str = String(text);
  var next;
  while (used.indexOf(str) > -1) {
    next = getNextMarkerText(str);
    if (next == str) break; // text that does not count up, and a Z
    str = next;
  }
  return str;
}

// The command that puts text on symbols, as one undo step. Text styles go on
// first, so that -symbols, which follows, reads the records as labels and
// writes a circle as icon=circle and icon-fill= rather than as r= and fill= --
// fill= being the text's color, on a label. The symbol options are each
// symbol's own, read before the text changes them (see getRestyleIconOptions()).
//
// A circle's stroke= is the text's outline on a label, so a circle's stroke
// comes off with -style.
//
//   groups: [{options, ids}] from getRestyleIconOptions() for the symbols
//   stroked: ids of the symbols with a stroke= or stroke-width= field
export function getAddMarkerTextCommand(text, groups, stroked) {
  var ids = flattenIds(groups);
  var parts = [formatFields('-labels', Object.assign(
    {text: encodeLabelText(text.text)}, getMarkerTextFields(text)), ids)];
  if (stroked.length > 0) {
    parts.push(formatFields('-style', {stroke: '', 'stroke-width': ''}, stroked));
  }
  groups.forEach(function(g) {
    parts.push(formatFields('-symbols', g.options, g.ids));
  });
  return parts.join(' ');
}

// The fields a marker's text puts on its record, which removing the text
// takes off. fill= goes too: -symbols writes a circle's own, and the text's
// would otherwise color a square's outline.
var TEXT_FIELDS = ['label-pos', 'font-family', 'font-size', 'font-style',
  'font-weight', 'fill', 'dx', 'dy', 'text-anchor'];

// The command that takes the text off markers, leaving their symbols, as one
// undo step. label-text goes with -each because -style keeps an empty
// label-text -- a label being typed is empty -- and a record with one is a
// label. -symbols then writes each symbol as a symbol, a circle as r= again.
//
//   groups: [{options, ids}], as for getAddMarkerTextCommand()
export function getRemoveMarkerTextCommand(groups) {
  var ids = flattenIds(groups);
  var cleared = {};
  var parts = ['-each ' + quoteCommandValue('d["label-text"] = undefined') +
    ' ids=' + ids.join(',')];
  TEXT_FIELDS.forEach(function(name) { cleared[name] = ''; });
  parts.push(formatFields('-style', cleared, ids));
  groups.forEach(function(g) {
    parts.push(formatFields('-symbols', g.options, g.ids));
  });
  return parts.join(' ');
}

// Groups symbols by the -symbols options that make each one again with its
// own style, for the commands above. @getStyle(rec) gives a symbol's panel
// style; @change(style), if given, edits it first.
export function groupRestyleOptions(records, ids, getStyle, change) {
  var groups = {};
  var list = [];
  ids.forEach(function(id) {
    var rec = records[id] || {};
    var style = getStyle(rec);
    var options, key;
    if (!style) return;
    if (change) change(style);
    options = getRestyleIconOptions(rec, style);
    key = JSON.stringify(options);
    if (!groups[key]) {
      groups[key] = {options: options, ids: []};
      list.push(groups[key]);
    }
    groups[key].ids.push(id);
  });
  return list;
}

function flattenIds(groups) {
  return groups.reduce(function(memo, g) { return memo.concat(g.ids); }, [])
    .sort(function(a, b) { return a - b; });
}

function formatFields(command, fields, ids) {
  var parts = [command];
  Object.keys(fields).forEach(function(name) {
    var val = fields[name];
    parts.push(name + '=' + (val === '' ? '' : formatValue(val)));
  });
  parts.push('ids=' + ids.join(','));
  return parts.join(' ');
}

function formatValue(val) {
  var str = String(val);
  return /^[A-Za-z0-9#._-]+$/.test(str) ? str : quoteCommandValue(str);
}

function isRegular(style, weight) {
  return (style || 'normal') == 'normal' && Number(weight || 400) == 400;
}
