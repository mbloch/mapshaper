import { getSvgSymbolTransform } from './gui-svg-symbols';
import { isMultilineLabel, toggleTextAlign, setMultilineAttribute, autoUpdateTextAnchor, applyDelta } from './gui-svg-labels';
import { error, internal } from './gui-core';
import { translateDeltaDisplayCoords, getPointCoordsById, getDisplayCoordsById } from './gui-map-utils';
import { EventDispatcher } from './gui-events';

export function SymbolDragging2(gui, ext, hit) {
  // var targetTextNode; // text node currently being dragged
  var dragging = false;
  var activeRecord;
  var activeId = -1;
  var self = new EventDispatcher();

  initDragging();

  return self;

  function labelEditingEnabled() {
    return gui.interaction && gui.interaction.getMode() == 'labels' ? true : false;
  }

  function locationEditingEnabled() {
    return gui.interaction && gui.interaction.getMode() == 'location' ? true : false;
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
    var o = internal.svg.importStyledLabel(d); // TODO: symbol support
    var activeLayer = hit.getHitTarget().layer;
    var xy = activeLayer.shapes[id][0];
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    var node2;
    o.properties.transform = getSvgSymbolTransform(xy, ext);
    o.properties['data-id'] = id;
    // o.properties['class'] = 'selected';
    g.innerHTML = internal.svg.stringify(o);
    node2 = g.firstChild;
    node.parentNode.replaceChild(node2, node);
    gui.dispatchEvent('popup-needs-refresh');
    return node2;
  }

  function initDragging() {
    var downEvt;
    var eventPriority = 1;

    // inspector and label editing aren't fully synced - stop editing if inspector opens
    // gui.on('inspector_on', function() {
    //   stopEditing();
    // });

    gui.on('interaction_mode_change', function(e) {
      if (e.mode != 'labels') {
        stopDragging();
      }
    });

    // down event on svg
    // a: off text
    //    -> stop editing
    // b: on text
    //    1: not editing -> nop
    //    2: on selected text -> start dragging
    //    3: on other text -> stop dragging, select new text

    hit.on('dragstart', function(e) {
      if (labelEditingEnabled()) {
        onLabelDragStart(e);
      } else if (locationEditingEnabled()) {
        onLocationDragStart(e);
      }
    });

    hit.on('drag', function(e) {
      if (labelEditingEnabled()) {
        onLabelDrag(e);
      } else if (locationEditingEnabled()) {
        onLocationDrag(e);
      }
    });

    hit.on('dragend', function(e) {
      if (locationEditingEnabled()) {
        onLocationDragEnd(e);
        stopDragging();
      } else if (labelEditingEnabled()) {
        stopDragging();
      }
    });

    hit.on('click', function(e) {
      if (labelEditingEnabled()) {
        onLabelClick(e);
      }
    });

    function onLocationDragStart(e) {
      if (e.id >= 0) {
        dragging = true;
        triggerGlobalEvent('symbol_dragstart', e);
      }
    }

    function onLocationDrag(e) {
      var lyr = hit.getHitTarget().layer;
      // get reference to
      var p = getPointCoordsById(e.id, hit.getHitTarget().layer);
      if (!p) return;
      var diff = translateDeltaDisplayCoords(e.dx, e.dy, ext);
      p[0] += diff[0];
      p[1] += diff[1];
      self.dispatchEvent('location_change'); // signal map to redraw
      triggerGlobalEvent('symbol_drag', e);
    }

    function onLocationDragEnd(e) {
      triggerGlobalEvent('symbol_dragend', e);
    }

    function onLabelClick(e) {
      var textNode = getTextTarget3(e);
      var rec = getLabelRecordById(e.id);
      if (textNode && rec && isMultilineLabel(textNode)) {
        toggleTextAlign(textNode, rec);
        updateSymbol2(textNode, rec, e.id);
        // e.stopPropagation(); // prevent pin/unpin on popup
      }
    }

    function triggerGlobalEvent(type, e) {
      if (e.id >= 0) {
        // fire event to signal external editor that symbol coords have changed
        gui.dispatchEvent(type, {FID: e.id, layer_name: hit.getHitTarget().layer.name});
      }
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

    function onLabelDragStart(e) {
      var textNode = getTextTarget3(e);
      var table = hit.getTargetDataTable();
      if (!textNode || !table) return;
      activeId = e.id;
      activeRecord = getLabelRecordById(activeId);
      dragging = true;
      downEvt = e;
    }

    function onLabelDrag(e) {
      var scale = ext.getSymbolScale() || 1;
      var textNode;
      if (!dragging) return;
      if (e.id != activeId) {
        error("Mismatched hit ids:", e.id, activeId);
      }
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
    }

    function getSymbolNodeById(id, parent) {
      // TODO: optimize selector
      var sel = '[data-id="' + id + '"]';
      return parent.querySelector(sel);
    }


    function getTextTarget3(e) {
      if (e.id > -1 === false || !e.container) return null;
      return getSymbolNodeById(e.id, e.container);
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

    // svg.addEventListener('mousedown', function(e) {
    //   var textTarget = getTextTarget(e);
    //   downEvt = e;
    //   if (!textTarget) {
    //     stopEditing();
    //   } else if (!editing) {
    //     // nop
    //   } else if (textTarget == targetTextNode) {
    //     startDragging();
    //   } else {
    //     startDragging();
    //     editTextNode(textTarget);
    //   }
    // });

    // up event on svg
    // a: currently dragging text
    //   -> stop dragging
    // b: clicked on a text feature
    //   -> start editing it


    // svg.addEventListener('mouseup', function(e) {
    //   var textTarget = getTextTarget(e);
    //   var isClick = isClickEvent(e, downEvt);
    //   if (isClick && textTarget && textTarget == targetTextNode &&
    //       activeRecord && isMultilineLabel(targetTextNode)) {
    //     toggleTextAlign(targetTextNode, activeRecord);
    //     updateSymbol();
    //   }
    //   if (dragging) {
    //     stopDragging();
    //    } else if (isClick && textTarget) {
    //     editTextNode(textTarget);
    //   }
    // });

    // block dbl-click navigation when editing
    // mouse.on('dblclick', function(e) {
    //   if (editing) e.stopPropagation();
    // }, null, eventPriority);

    // mouse.on('dragstart', function(e) {
    //   onLabelDrag(e);
    // }, null, eventPriority);

    // mouse.on('drag', function(e) {
    //   var scale = ext.getSymbolScale() || 1;
    //   onLabelDrag(e);
    //   if (!dragging || !activeRecord) return;
    //   applyDelta(activeRecord, 'dx', e.dx / scale);
    //   applyDelta(activeRecord, 'dy', e.dy / scale);
    //   if (!isMultilineLabel(targetTextNode)) {
    //     // update anchor position of single-line labels based on label position
    //     // relative to anchor point, for better placement when eventual display font is
    //     // different from mapshaper's font.
    //     updateTextAnchor(targetTextNode, activeRecord);
    //   }
    //   // updateSymbol(targetTextNode, activeRecord);
    //   targetTextNode = updateSymbol2(targetTextNode, activeRecord, activeId);
    // }, null, eventPriority);

    // mouse.on('dragend', function(e) {
    //   onLabelDrag(e);
    //   stopDragging();
    // }, null, eventPriority);


    // function onLabelDrag(e) {
    //   if (dragging) {
    //     e.stopPropagation();
    //   }
    // }
  }

  function stopDragging() {
    dragging = false;
    activeId = -1;
    activeRecord = null;
    // targetTextNode = null;
    // svg.removeAttribute('class');
  }

  function isClickEvent(up, down) {
    var elapsed = Math.abs(down.timeStamp - up.timeStamp);
    var dx = up.screenX - down.screenX;
    var dy = up.screenY - down.screenY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= 4 && elapsed < 300;
  }


  // function deselectText(el) {
  //   el.removeAttribute('class');
  // }

  // function selectText(el) {
  //   el.setAttribute('class', 'selected');
  // }


}
