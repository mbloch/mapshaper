/* @requires mapshaper-gui-lib */

function SvgDisplayLayer(ext, mouse) {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  var el = El(svg);
  var editing = false;
  var dragging = false;
  var textNode;
  var activeLayer;

  initDragging();

  // need to handle several kinds of changes
  // a) map extent changes (e.g. on pan, zoom or window resize), all else is the same
  // b) layer changes (new set of symbols)
  // c) same layer, but symbols have changed (different attributes, etc.)
  // actions: (a) reposition existing symbols; (b, c) remove all existing symbols, re-render
  el.drawLayer = function(lyr, repositionOnly) {
    var hasLabels = internal.layerHasLabels(lyr);
    var transform = ext.getTransform();
    if (!hasLabels) {
      clear();
    } else if (activeLayer && repositionOnly) {
      resize(ext);
      reposition(lyr, transform);
    } else {
      clear();
      resize(ext);
      renderLabels(lyr, transform);
      activeLayer = lyr;
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
      if (dragging) {
        stopDragging();
      } else if (isClick && textTarget) {
        editTextNode(textTarget);
      }
    });

    mouse.on('dragstart', function(e) {
      var table, i;
      onDrag(e);
      if (!textNode) return; // error
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
    }, null, eventPriority);

    mouse.on('drag', function(e) {
      onDrag(e);
      if (!dragging || !activeRecord) return;
      applyDelta(activeRecord, 'dx', e.dx);
      applyDelta(activeRecord, 'dy', e.dy);
      setMultilineAttribute(textNode, 'dx', activeRecord.dx);
      textNode.setAttribute('dy', activeRecord.dy);
    }, null, eventPriority);

    mouse.on('dragend', function(e) {
      onDrag(e);
      stopDragging();
    }, null, eventPriority);

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
    var dx = up.screenX - down.screenX;
    var dy = up.screenY - down.screenY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= 4;
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
    if (textNode) deselectText(textNode);
    editing = true;
    gui.dispatchEvent('label_editor_on'); // signal inspector to close
    textNode = el;
    selectText(el);
    // TODO: show editing panel
  }

  function getTextTarget(e) {
    var el = e.target;
    if (el.tagName == 'tspan') {
      el = el.parentNode;
    }
    return el.tagName == 'text' ? el : null;
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

  function reposition(lyr, fwd) {
    var texts = svg.getElementsByTagName('text');
    var n = texts.length;
    var text, xy, idx, p;
    for (var i=0; i<n; i++) {
      text = texts[i];
      idx = +text.getAttribute('data-id');
      p = lyr.shapes[idx];
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
    var str = internal.svg.stringify(obj);
    svg.innerHTML = str;
  }

  function clear() {
    if (activeLayer) {
      stopEditing();
      while (svg.lastChild) {
        svg.removeChild(svg.lastChild);
      }
      activeLayer = null;
    }
  }

  function resize(ext) {
    svg.style.width = ext.width() + 'px';
    svg.style.height = ext.height() + 'px';
  }

  return el;
}
