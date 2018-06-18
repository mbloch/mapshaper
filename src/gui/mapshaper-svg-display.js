/* @requires mapshaper-gui-lib */

function SvgDisplayLayer(ext, mouse) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var el = El(svg);
  var editing = false;
  var dragging = false;
  var textNode;
  var activeLayer;
  var activeRecord;

  initDragging();

  el.clear = clear;

  el.reposition = function(target) {
    var transform = ext.getTransform();
    resize(ext);
    reposition(target, transform);
  };

  el.drawLayer = function(target) {
    var transform = ext.getTransform();
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    // kludge to identify container when symbols are repositioned
    var id = utils.getUniqueName();
    g.setAttribute('id', id);
    target.svg_id = id;
    resize(ext);
    g.innerHTML = renderLabels(target.layer, transform);
    svg.append(g);
    if (target.active) {
      activeLayer = target.layer;
    } else {
      g.style.pointerEvents = 'none';
    }
  };

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
      onDrag(e);
      if (!dragging || !activeRecord) return;
      applyDelta(activeRecord, 'dx', e.dx);
      applyDelta(activeRecord, 'dy', e.dy);
      if (!isMultilineLabel(textNode)) {
        // update anchor position of single-line labels based on label position
        // relative to anchor point, for better placement when eventual display font is
        // different from mapshaper's font.
        updateTextAnchor(textNode, activeRecord);
      }
      setMultilineAttribute(textNode, 'dx', activeRecord.dx);
      textNode.setAttribute('dy', activeRecord.dy);
    }, null, eventPriority);

    mouse.on('dragend', function(e) {
      onDrag(e);
      stopDragging();
    }, null, eventPriority);

    function toggleTextAlign(textNode, rec) {
      var curr = rec['text-anchor'] || 'middle';
      var targ = curr == 'middle' && 'start' || curr == 'start' && 'end' || 'middle';
      updateTextAnchor(textNode, rec, targ);
      setMultilineAttribute(textNode, 'dx', rec.dx);
    }

    // @value: optional position to set; if missing, auto-set
    function updateTextAnchor(textNode, rec, value) {
      var rect = textNode.getBoundingClientRect();
      var width = rect.width;
      var anchorX = +textNode.getAttribute('x');
      var labelCenterX = rect.left - svg.getBoundingClientRect().left + width / 2;
      var xpct = (labelCenterX - anchorX) / width; // offset of label center from anchor center
      var curr = rec['text-anchor'] || 'middle';
      var xshift = 0;
      var targ = value || xpct < -0.25 && 'end' || xpct > 0.25 && 'start' || 'middle';
      if (curr == 'middle' && targ == 'end' || curr == 'start' && targ == 'middle') {
        xshift = width / 2;
      } else if (curr == 'middle' && targ == 'start' || curr == 'end' && targ == 'middle') {
        xshift = -width / 2;
      } else if (curr == 'start' && targ == 'end') {
        xshift = width;
      } else if (curr == 'end' && targ == 'start') {
        xshift = -width;
      }
      if (xshift) {
        rec['text-anchor'] = targ;
        applyDelta(rec, 'dx', xshift);
        textNode.setAttribute('text-anchor', targ);
      }
    }

    // handle either numeric strings or numbers in fields
    function applyDelta(rec, key, delta) {
      var currVal = rec[key];
      var isString = utils.isString(currVal);
      var newVal = (+currVal + delta) || 0;
      rec[key] = isString ? String(newVal) : newVal;
    }

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

  function isMultilineLabel(textNode) {
    return textNode.childNodes.length > 1;
  }

  // Set an attribute on a <text> node and any child <tspan> elements
  // (mapshaper's svg labels require tspans to have the same x and dx values
  //  as the enclosing text node)
  function setMultilineAttribute(textNode, name, value) {
    var n = textNode.childNodes.length;
    var i = -1;
    var child;
    textNode.setAttribute(name, value);
    while (++i < n) {
      child = textNode.childNodes[i];
      if (child.tagName == 'tspan') {
        child.setAttribute(name, value);
      }
    }
  }

  function reposition(target, fwd) {
    var container = document.getElementById(target.svg_id);
    var texts = container.getElementsByTagName('text');
    var n = texts.length;
    var text, xy, idx, p;
    for (var i=0; i<n; i++) {
      text = texts[i];
      idx = +text.getAttribute('data-id');
      p = target.layer.shapes[idx];
      if (!p) continue;
      xy = fwd.transform(p[0][0], p[0][1]);
      setMultilineAttribute(text, 'x', xy[0]);
      text.setAttribute('y', xy[1]);
    }
  }

  function renderLabels(lyr, fwd) {
    var records = lyr.data.getRecords();
    var opts = {};
    var symbols = lyr.shapes.map(function(shp, i) {
      var d = records[i];
      var p = shp[0];
      var p2 = fwd.transform(p[0], p[1]);
      var obj = internal.svg.importLabel(p2, d);
      internal.svg.applyStyleAttributes(obj, 'Point', d);
      obj.properties['data-id'] = i;
      return obj;
    });
    var obj = internal.getEmptyLayerForSVG(lyr, opts);
    obj.children = symbols;
    return internal.svg.stringify(obj);
  }

  function clear() {
    if (editing) stopEditing();
    while (svg.childNodes.length > 0) {
      svg.removeChild(svg.childNodes[0]);
    }
    activeLayer = null;
  }

  function resize(ext) {
    svg.style.width = ext.width() + 'px';
    svg.style.height = ext.height() + 'px';
  }

  return el;
}
