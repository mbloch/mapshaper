import { error, internal } from './gui-core';
import {
  // isMultilineLabel,
  setMultilineAttribute,
  autoUpdateTextAnchor,
  applyDelta,
  updateNumber } from './gui-svg-labels';
import { getSvgSymbolTransform } from './gui-svg-symbols';

export function initLabelDragging(gui, ext, hit) {
  var downEvt;
  var activeId = -1;
  var prevHitEvt;
  var activeRecord;

  function active() {
    return gui.interaction.getMode() == 'labels';
  }

  function labelSelected(e) {
    return e.id > -1 && active();
  }

  hit.on('dragstart', function(e) {
    if (!labelSelected(e)) return;
    var symNode = getSymbolTarget(e);
    var table = hit.getTargetDataTable();
    if (!symNode || !table) {
      activeId = -1;
      return false;
    }
    activeId = e.id;
    activeRecord = getLabelRecordById(activeId);
    downEvt = e;
    gui.dispatchEvent('label_dragstart', {FID: activeId});
  });

  hit.on('change', function(e) {
    if (!active()) return;
    if (prevHitEvt) clearLabelHighlight(prevHitEvt);
    showLabelHighlight(e);
    prevHitEvt = e;
  });

  function clearLabelHighlight(e) {
    var txt = getTextNode(getSymbolTarget(e));
    if (txt) txt.classList.remove('active-label');
  }

  function showLabelHighlight(e) {
    var txt = getTextNode(getSymbolTarget(e));
    if (txt) txt.classList.add('active-label');
  }

  hit.on('drag', function(e) {
    if (!labelSelected(e) || activeId == -1) return;
    if (e.id != activeId) {
      error("Mismatched hit ids:", e.id, activeId);
    }
    var scale = ext.getSymbolScale() || 1;
    var symNode, textNode;
    applyDelta(activeRecord, 'dx', e.dx / scale);
    applyDelta(activeRecord, 'dy', e.dy / scale);
    symNode = getSymbolTarget(e);
    textNode = getTextNode(symNode);
    // update anchor position of labels based on label position relative
    // to anchor point, for better placement when eventual display font is
    // different from mapshaper's font.
    // if (!isMultilineLabel(textNode)) {
    autoUpdateTextAnchor(textNode, activeRecord, getDisplayCoordsById(activeId, hit.getHitTarget(), ext));
    // }
    updateNumber(activeRecord, 'dx', internal.roundToDigits(+activeRecord.dx, 3));
    updateNumber(activeRecord, 'dy', internal.roundToDigits(+activeRecord.dy, 3));
    updateTextNode(textNode, activeRecord);
    // updateSymbolNode(symNode, activeRecord, activeId);
    gui.dispatchEvent('popup-needs-refresh');
  });

  hit.on('dragend', function(e) {
    if (!labelSelected(e) || activeId == -1) return;
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

  function getSymbolTarget(e) {
    return e.id > -1 ? getSymbolNodeById(e.id) : null;
  }

  function getTextNode(symNode) {
    if (!symNode) return null;
    if (symNode.tagName == 'text') return symNode;
    return symNode.querySelector('text');
  }

  // function getSymbolNodeById_OLD(id, parent) {
  //   var sel = '[data-id="' + id + '"]';
  //   return parent.querySelector(sel);
  // }

  function getSymbolNodeById(id) {
    // TODO: optimize selector
    var sel = '[data-id="' + id + '"]';
    var activeLayer = hit.getHitTarget();
    return activeLayer.gui.svg_container.querySelector(sel);
  }

  // function getTextTarget2(e) {
  //   var el = e && e.targetSymbol || null;
  //   if (el && el.tagName == 'tspan') {
  //     el = el.parentNode;
  //   }
  //   return el && el.tagName == 'text' ? el : null;
  // }

  // function getTextTarget(e) {
  //   var el = e.target;
  //   if (el.tagName == 'tspan') {
  //     el = el.parentNode;
  //   }
  //   return el.tagName == 'text' ? el : null;
  // }

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
  function updateTextNode(node, d) {
    var a = d['text-anchor'];
    if (a) node.setAttribute('text-anchor', a);
    // dx data property is applied to svg x property
    // setMultilineAttribute(node, 'dx', d.dx || 0);
    setMultilineAttribute(node, 'x', d.dx || 0);
    node.setAttribute('y', d.dy || 0);
  }

  // update symbol by re-rendering it
  // fails when symbol includes a dot (<g><circle/><text/></g> structure)
  function updateSymbolNode(node, d, id) {
    var o = internal.svg.renderStyledLabel(d); // TODO: symbol support
    var activeLayer = hit.getHitTarget();
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
  }
}
