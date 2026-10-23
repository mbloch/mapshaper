// The style that new objects take from a selection.
//
// The editing tools give a new object the style of the objects last selected,
// as a drawing program does: what the panel shows for a selection is what
// the next object gets, and selecting an object is the way to draw another in
// its style. A selection whose objects disagree about a property says nothing
// about it, so only the properties they agree on are taken, and the new
// object keeps whatever it had for the rest.
//
// Only a selection counts. With nothing selected the panels show every object
// in the layer, and leaving a drawing tool would otherwise replace the style
// just set for the next object with the layer's.
import {
  getIconShape, getIconStyle, getIconPaint, getCurveStyle, getArrowheadPosition,
  shapeHasStrokeWidth, shapeHasRotation
} from './gui-symbol-style';
import { getMarkerTextStyle } from './gui-marker-style';

// The values that every record in @records agrees on, for each of @fields, as
// [[field, value], ...] -- the form the panels' controls produce. A field that
// none of them has is ['field', ''], which the style mergers take as "unset";
// a field they disagree about is left out. Values are compared as strings, so
// that 3 and '3' agree, as they do on the map.
export function getSharedStyleValues(records, fields) {
  var out = [];
  if (!records || records.length === 0) return out;
  fields.forEach(function(field) {
    var first = getStyleValue(records[0], field);
    for (var i = 1; i < records.length; i++) {
      if (String(getStyleValue(records[i], field)) !== String(first)) return;
    }
    out.push([field, first]);
  });
  return out;
}

// The symbol tool's new-symbol style is the panel's own model of a style
// ({icon, curve, text}, see gui-symbol-tool.mjs) rather than record fields, so
// it is set key by key from the values the panel shows for the selection.
// Changes @style in place.
//
// sel: records of the selected symbols, as the panel divides them:
//   icons: symbols in a shape the panel offers (markers included)
//   openCurves, closedCurves
//   markers: the icons with text on them, whose text style -- but not text --
//     is taken
export function syncSymbolStyle(style, sel) {
  var icons = sel.icons || [];
  var curves = (sel.openCurves || []).concat(sel.closedCurves || []);
  var open = sel.openCurves || [];
  syncKeys(style.icon, icons, ['shape', 'size'], getIconStyle);
  syncKeys(style.icon, icons, ['fill', 'stroke'], getIconPaint);
  // as the panel shows them: the shapes that have them
  syncKeys(style.icon, icons.filter(function(rec) {
    return shapeHasStrokeWidth(getIconShape(rec));
  }), ['strokeWidth'], getIconPaint);
  syncKeys(style.icon, icons.filter(function(rec) {
    return shapeHasRotation(getIconShape(rec));
  }), ['rotation'], getIconStyle);
  syncKeys(style.curve, curves, ['stroke', 'strokeWidth'], getCurveStyle);
  // the ends, from the open curves: a closed one has none
  syncKeys(style.curve, open, ['arrowheads', 'fade', 'taper'], getCurveStyle);
  // a shape and size only where there are heads, which a curve with none
  // says nothing about
  open = open.filter(function(rec) { return getArrowheadPosition(rec) != 'none'; });
  syncKeys(style.curve, open, ['arrowShape', 'arrowSize'], getCurveStyle);
  syncKeys(style.curve, sel.closedCurves || [], ['fill'], getCurveStyle);
  syncKeys(style.text, sel.markers || [],
    ['font', 'style', 'weight', 'size', 'color', 'baseline'], getMarkerTextStyle);
  return style;
}

// Sets each of @keys of @target to the value @read(rec) gives it for every
// record in @records, where they agree
function syncKeys(target, records, keys, read) {
  var styles = records.map(read);
  keys.forEach(function(key) {
    var val;
    if (styles.length === 0) return;
    val = styles[0][key];
    for (var i = 1; i < styles.length; i++) {
      if (styles[i][key] !== val) return;
    }
    target[key] = val;
  });
}

// The keys of @values (an object) whose value differs from @style's, as the
// changes that would make @style agree with them
export function getChangedStyleKeys(style, values) {
  return Object.keys(values).filter(function(key) {
    return !sameValue(style[key], values[key]);
  });
}

function sameValue(a, b) {
  return String(isUnset(a) ? '' : a) === String(isUnset(b) ? '' : b);
}

function getStyleValue(rec, field) {
  var val = rec ? rec[field] : undefined;
  return isUnset(val) ? '' : val;
}

function isUnset(val) {
  return val === undefined || val === null || val === '';
}
