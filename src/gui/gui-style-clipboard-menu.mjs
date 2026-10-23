// "copy style" and "paste style" in the map's right-click menu, in the tools
// that style objects. The copied style is held for the session in
// gui.state.style_clipboard; see gui-style-clipboard.mjs for what a style is
// and how it is pasted.
//
// A paste goes to the selection when the object right-clicked is part of it,
// and otherwise to that object alone -- or, with nothing under the pointer, to
// the selection.
import { internal } from './gui-core';
import { getPointKind } from './gui-layer-contents';
import { curveShapeIsClosed, getIconShape } from './gui-symbol-style';
import { WRAP_FIELDS, rewrapLabelValue } from './gui-label-wrap';
import { runGuiEditCommand } from './gui-edit-command';
import { copyObjectStyle, canPasteStyle, getPasteStyleCommand } from './gui-style-clipboard';

var STYLE_MODES = ['line_style', 'polygon_style', 'edit_lines', 'edit_polygons',
  'reshape_lines', 'reshape_polygons', 'curve_lines', 'label', 'label_style', 'symbols'];

// Adds e.copyStyle and e.pasteStyle to the event that opens the menu
//   lyr: the layer the menu is opened on
//   clickedId: (optional) the object right-clicked, if not e.id
export function addStyleClipboardItems(gui, e, lyr, clickedId) {
  var hit = gui.map.getHitControl && gui.map.getHitControl();
  var id = clickedId === undefined ? e.id : clickedId;
  var style, copied, ids, count;
  if (!lyr || !hit || STYLE_MODES.indexOf(gui.interaction.getMode()) == -1) return;
  if (id > -1) {
    style = copyObjectStyle(getStyleObject(lyr, id));
  }
  if (style) {
    e.copyStyle = function() {
      gui.state.style_clipboard = style;
    };
  }
  copied = gui.state.style_clipboard;
  if (!copied) return;
  ids = getPasteIds(hit.getSelectionIds(), id);
  count = getPasteTargets(lyr, ids, copied).length;
  if (count === 0) return;
  e.pasteStyle = {
    count: count,
    run: function() {
      pasteStyle(gui, hit, lyr, ids, copied);
    }
  };
}

function getPasteIds(selection, id) {
  if (id > -1 && selection.indexOf(id) == -1) return [id];
  return selection;
}

function getPasteTargets(lyr, ids, style) {
  return ids.map(function(id) {
    return getStyleObject(lyr, id);
  }).filter(function(obj) {
    return canPasteStyle(style, obj);
  });
}

function pasteStyle(gui, hit, lyr, ids, style) {
  var selection = hit.getSelectionIds();
  var cmd = getPasteStyleCommand(style, getPasteTargets(lyr, ids, style), {
    getRewrappedText: getRewrappedText
  });
  if (!cmd) return;
  runGuiEditCommand(gui, cmd, {
    title: 'Paste style',
    changesEditTarget: true,
    onSuccess: function() {
      // -symbols makes the symbols again, which the selection does not survive
      if (selection.length > 0) hit.setSelectionIds(selection);
    }
  });
}

function getRewrappedText(obj, values) {
  var text = obj.rec && obj.rec['label-text'];
  var wrapped;
  if (!text || obj.pathLabel) return null;
  if (!WRAP_FIELDS.some(function(field) { return field in values; })) return null;
  wrapped = rewrapLabelValue(text, Object.assign({}, obj.rec, values));
  return wrapped !== text ? wrapped : null;
}

// The object @id in @lyr, as gui-style-clipboard.mjs describes one, or null
// for one with no style that can be copied or pasted: a plain point, or a
// symbol in a shape the symbol panel does not offer.
function getStyleObject(lyr, id) {
  var rec = lyr.data ? lyr.data.getRecords()[id] : null;
  var shp = lyr.shapes ? lyr.shapes[id] : null;
  var kind;
  if (!shp) return null;
  if (lyr.geometry_type == 'polyline' || lyr.geometry_type == 'polygon') {
    return {id: id, kind: lyr.geometry_type == 'polygon' ? 'polygon' : 'line', rec: rec || {}};
  }
  if (lyr.geometry_type != 'point' || !rec) return null;
  kind = getPointKind(rec);
  if (kind == 'label') {
    return {id: id, kind: 'label', rec: rec, pathLabel: internal.svg.shapeIsPathLabel(shp, rec)};
  }
  if (kind != 'symbol' && kind != 'circle') return null;
  if (internal.svg.shapeIsCurve(shp, rec)) {
    return {id: id, kind: 'curve', rec: rec, closed: curveShapeIsClosed(shp)};
  }
  if (!getIconShape(rec)) return null;
  return {id: id, kind: 'icon', rec: rec, marker: internal.svg.featureIsMarker(rec)};
}
