import { error, internal } from './gui-core';
import { isMultilineLabel, toggleTextAlign, setMultilineAttribute, autoUpdateTextAnchor, applyDelta } from './gui-svg-labels';
import { getSvgSymbolTransform } from './gui-svg-symbols';

export function initLabelDragging(gui, ext, hit) {
  var downEvt;
  var activeId;
  var activeRecord;

  function active(e) {
    return e.id > -1 && gui.interaction.getMode() == 'labels';
  }

  hit.on('dragstart', function(e) {
    if (!active(e)) return;
    var textNode = getTextTarget3(e);
    var table = hit.getTargetDataTable();
    if (!textNode || !table) {
      activeId = -1;
      return false;
    }
    activeId = e.id;
    activeRecord = getLabelRecordById(activeId);
    downEvt = e;
    gui.dispatchEvent('label_dragstart', {FID: activeId});
  });

  hit.on('drag', function(e) {
    if (!active(e) || activeId == -1) return;
    if (e.id != activeId) {
      error("Mismatched hit ids:", e.id, activeId);
    }
    var scale = ext.getSymbolScale() || 1;
    var textNode;
    applyDelta(activeRecord, 'dx', e.dx / scale);
    applyDelta(activeRecord, 'dy', e.dy / scale);
    textNode = getTextTarget3(e);
    if (!isMultilineLabel(textNode)) {
      // update anchor position of single-line labels based on label position
      // relative to anchor point, for better placement when eventual display font is
      // different from mapshaper's font.
      autoUpdateTextAnchor(textNode, activeRecord, getDisplayCoordsById(activeId, hit.getHitTarget().layer, ext));
    }
    // updateSymbol(targetTextNode, activeRecord);
    updateSymbol2(textNode, activeRecord, activeId);
  });

  hit.on('dragend', function(e) {
    if (!active(e) || activeId == -1) return;
    gui.dispatchEvent('label_dragend', {FID: e.id});
    activeId = -1;
    activeRecord = null;
    downEvt = null;
  });

  function getDisplayCoordsById(id, layer, ext) {
    var coords = getPointCoordsById(id, layer);
    return ext.translateCoords(coords[0], coords[1]);
  }

  function getPointCoordsById(id, layer) {
    var coords = layer && layer.geometry_type == 'point' && layer.shapes[id];
    if (!coords || coords.length != 1) {
      return null;
    }
    return coords[0];
  }

  function getTextTarget3(e) {
    if (e.id > -1 === false || !e.container) return null;
    return getSymbolNodeById(e.id, e.container);
  }

  function getSymbolNodeById(id, parent) {
    // TODO: optimize selector
    var sel = '[data-id="' + id + '"]';
    return parent.querySelector(sel);
  }

  function getTextTarget2(e) {
    var el = e && e.targetSymbol || null;
    if (el && el.tagName == 'tspan') {
      el = el.parentNode;
    }
    return el && el.tagName == 'text' ? el : null;
  }

  function getTextTarget(e) {
    var el = e.target;
    if (el.tagName == 'tspan') {
      el = el.parentNode;
    }
    return el.tagName == 'text' ? el : null;
  }

  function getLabelRecordById(id) {
    var table = hit.getTargetDataTable();
    if (id >= 0 === false || !table) return null;
    // add dx and dy properties, if not available
    if (!table.fieldExists('dx')) {
      table.addField('dx', 0);
    }
    if (!table.fieldExists('dy')) {
      table.addField('dy', 0);
    }
    if (!table.fieldExists('text-anchor')) {
      table.addField('text-anchor', '');
    }
    return table.getRecordAt(id);
  }

  // update symbol by setting attributes
  function updateSymbol(node, d) {
    var a = d['text-anchor'];
    if (a) node.setAttribute('text-anchor', a);
    setMultilineAttribute(node, 'dx', d.dx || 0);
    node.setAttribute('y', d.dy || 0);
  }

  // update symbol by re-rendering it
  function updateSymbol2(node, d, id) {
    var o = internal.svg.renderStyledLabel(d); // TODO: symbol support
    var activeLayer = hit.getHitTarget().layer;
    var xy = activeLayer.shapes[id][0];
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    var node2;
    o.properties.transform = getSvgSymbolTransform(xy, ext);
    o.properties['data-id'] = id;
    o.properties.class = 'mapshaper-svg-symbol';
    // o.properties['class'] = 'selected';
    g.innerHTML = internal.svg.stringify(o);
    node2 = g.firstChild;
    node.parentNode.replaceChild(node2, node);
    gui.dispatchEvent('popup-needs-refresh');
    return node2;
  }
}
