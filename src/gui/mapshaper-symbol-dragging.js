/* @requires
mapshaper-gui-lib
mapshaper-svg-labels
*/

function SymbolDragging(gui, ext, mouse, svg) {
  var el = El(svg);
  var editing = false;
  var dragging = false;
  var textNode;
  var activeLayer;
  var activeRecord;
  var activeId = -1;

  initDragging();

  return {
    editLayer: function(target, type) {
      activeLayer = target.layer;
    },
    clear: function() {
      if (editing) stopEditing();
      activeLayer = null;
    }
  };

  // update symbol by setting attributes
  function updateSymbol(node, d) {
    var a = d['text-anchor'];
    if (a) node.setAttribute('text-anchor', a);
    setMultilineAttribute(node, 'dx', d.dx || 0);
    node.setAttribute('y', d.dy || 0);
  }

  // update symbol by re-rendering it
  function updateSymbol2(node, d) {
    var o = internal.svg.importStyledLabel(d); // TODO: symbol support
    var xy = activeLayer.shapes[activeId][0];
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    var node2;
    o.properties.transform = getSvgSymbolTransform(xy, ext);
    o.properties['data-id'] = activeId;
    o.properties['class'] = 'selected';
    g.innerHTML = internal.svg.stringify(o);
    node2 = g.firstChild;
    node.parentNode.replaceChild(node2, node);
    return node2;
  }

  function initDragging() {
    var downEvt;
    var eventPriority = 1;

    // inspector and label editing aren't fully synced - stop editing if inspector opens
    gui.on('inspector_on', function() {
      stopEditing();
    });

    // down event on svg
    // a: off text
    //    -> stop editing
    // b: on text
    //    1: not editing -> nop
    //    2: on selected text -> start dragging
    //    3: on other text -> stop dragging, select new text
    svg.addEventListener('mousedown', function(e) {
      var textTarget = getTextTarget(e);
      downEvt = e;
      if (!textTarget) {
        stopEditing();
      } else if (!editing) {
        // nop
      } else if (textTarget == textNode) {
        startDragging();
      } else {
        startDragging();
        editTextNode(textTarget);
      }
    });

    // up event on svg
    // a: currently dragging text
    //   -> stop dragging
    // b: clicked on a text feature
    //   -> start editing it
    svg.addEventListener('mouseup', function(e) {
      var textTarget = getTextTarget(e);
      var isClick = isClickEvent(e, downEvt);
      if (isClick && textTarget && textTarget == textNode &&
          activeRecord && isMultilineLabel(textNode)) {
        toggleTextAlign(textNode, activeRecord);
        updateSymbol();
      }
      if (dragging) {
        stopDragging();
       } else if (isClick && textTarget) {
        editTextNode(textTarget);
      }
    });

    // block dbl-click navigation when editing
    mouse.on('dblclick', function(e) {
      if (editing) e.stopPropagation();
    }, null, eventPriority);

    mouse.on('dragstart', function(e) {
      onDrag(e);
    }, null, eventPriority);

    mouse.on('drag', function(e) {
      var scale = ext.getSymbolScale() || 1;
      onDrag(e);
      if (!dragging || !activeRecord) return;
      applyDelta(activeRecord, 'dx', e.dx / scale);
      applyDelta(activeRecord, 'dy', e.dy / scale);
      if (!isMultilineLabel(textNode)) {
        // update anchor position of single-line labels based on label position
        // relative to anchor point, for better placement when eventual display font is
        // different from mapshaper's font.
        updateTextAnchor(textNode, activeRecord);
      }
      // updateSymbol(textNode, activeRecord);
      textNode = updateSymbol2(textNode, activeRecord, activeId);
    }, null, eventPriority);

    mouse.on('dragend', function(e) {
      onDrag(e);
      stopDragging();
    }, null, eventPriority);

    function startDragging() {
      dragging = true;
      svg.setAttribute('class', 'dragging');
    }

    function stopDragging() {
      dragging = false;
      svg.removeAttribute('class');
    }

    function onDrag(e) {
      if (dragging) {
        e.stopPropagation();
      }
    }
  }

  function isClickEvent(up, down) {
    var elapsed = Math.abs(down.timeStamp - up.timeStamp);
    var dx = up.screenX - down.screenX;
    var dy = up.screenY - down.screenY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= 4 && elapsed < 300;
  }

  function stopEditing() {
    if (dragging) {
      stopDragging();
    }
    if (editing) {
      // TODO: close editing panel
      editing = false;
    }
    if (textNode) deselectText(textNode);
    textNode = null;
  }

  function deselectText(el) {
    el.removeAttribute('class');
  }

  function selectText(el) {
    el.setAttribute('class', 'selected');
  }

  function editTextNode(el) {
    var table, i;
    if (textNode) deselectText(textNode);
    textNode = el;
    editing = true;
    gui.dispatchEvent('label_editor_on'); // signal inspector to close
    selectText(el);
    table = activeLayer.data;
    i = +textNode.getAttribute('data-id');
    activeRecord = table.getRecords()[i];
    activeId = i;
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
    // TODO: show editing panel
  }

  function getTextTarget(e) {
    var el = e.target;
    if (el.tagName == 'tspan') {
      el = el.parentNode;
    }
    return el.tagName == 'text' ? el : null;
  }

}
