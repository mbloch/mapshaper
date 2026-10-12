import { internal } from './gui-core';

// The symbol tool's hover and selection cues, drawn in the layer's SVG beside
// each symbol: a box around an icon, and a ring on each knot of a curve. They
// use the label tool's cue styles (.label-cue-* in page.css), so that a
// selected symbol looks like a selected label.
//
// A layer of canvas-drawn circles has no SVG to draw into; its selection is
// drawn by the overlay instead (see getOverlayLayers()).

var SVG_NS = 'http://www.w3.org/2000/svg';
var BOX_PADDING = 3; // px
var KNOT_RADIUS = 3.2;

// getState: function returning {selected: [ids], hoverId}
// isSymbol: function(target, id) -> true for a feature the tool edits
export function SymbolSelection(gui, ext, hit, getState, isSymbol) {
  var self = {};
  var groups = [];
  var drawn = null;
  var on = false;

  self.turnOn = function() {
    on = true;
    self.refresh(true);
  };

  self.turnOff = function() {
    on = false;
    clearAll();
  };

  // Redraws the cues. A map redraw replaces the layer's markup and the cues
  // with it, so this is called after one with force set.
  self.refresh = function(force) {
    var target = hit.getHitTarget();
    var state = on ? getState() : {selected: [], hoverId: -1};
    var key = state.selected.join(',') + '/' + state.hoverId;
    if (!force && key === drawn) return;
    clearAll();
    drawn = key;
    if (!target || !target.gui || !target.gui.svg_container) return;
    if (state.hoverId > -1 && state.selected.indexOf(state.hoverId) == -1) {
      draw(target, state.hoverId, 'label-cue-hovered', false);
    }
    state.selected.forEach(function(id) {
      draw(target, id, 'label-cue-selected', true);
    });
  };

  function draw(target, id, className, selected) {
    var node = findNode(target, id);
    var shp = getDisplayShapes(target)[id];
    var g;
    if (!node || !shp || !isSymbol(target, id)) return;
    g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'label-cue symbol-cue ' + className);
    copyAttribute(node, g, 'transform');
    copyAttribute(node, g, 'display');
    if (internal.svg.shapeIsCurve(shp, getRecord(target, id))) {
      appendCurveTrace(g, shp);
      if (selected) appendKnots(g, shp);
    } else {
      appendBox(g, node);
    }
    node.parentNode.insertBefore(g, node.nextSibling);
    groups.push(g);
  }

  function appendBox(g, node) {
    var box = measure(node);
    var el;
    if (!box) return;
    el = document.createElementNS(SVG_NS, 'rect');
    el.setAttribute('x', box.x - BOX_PADDING);
    el.setAttribute('y', box.y - BOX_PADDING);
    el.setAttribute('width', box.width + BOX_PADDING * 2);
    el.setAttribute('height', box.height + BOX_PADDING * 2);
    el.setAttribute('class', 'label-cue-box');
    g.appendChild(el);
  }

  // A hairline along the curve, in the box's style: the curve's own stroke
  // may be too thin or too pale to show that it is the one selected
  function appendCurveTrace(g, shp) {
    var coords = getCurveCoords(shp);
    var el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('d', internal.svg.getCurvePathData(coords, internal.svg.curveIsClosed(coords)));
    el.setAttribute('class', 'label-cue-box');
    g.appendChild(el);
  }

  // In the coordinates inside the symbol's group, mapped the way the
  // renderer maps the curve, so that the cues sit on the curve
  function getCurveCoords(shp) {
    return internal.svg.getLabelPathCoords(shp, ext.getTransform(), ext.getSymbolScale());
  }

  function appendKnots(g, shp) {
    var coords = getCurveCoords(shp);
    coords.forEach(function(p, i) {
      var el;
      // a closed curve's last knot is its first
      if (i > 0 && i == coords.length - 1 && samePoint(p, coords[0])) return;
      el = document.createElementNS(SVG_NS, 'circle');
      el.setAttribute('cx', p[0]);
      el.setAttribute('cy', p[1]);
      el.setAttribute('r', KNOT_RADIUS);
      el.setAttribute('class', 'label-cue-knot');
      g.appendChild(el);
    });
  }

  function findNode(target, id) {
    return target.gui.svg_container.querySelector('.mapshaper-svg-symbol[data-id="' + id + '"]');
  }

  function getRecord(target, id) {
    var records = target.data ? target.data.getRecords() : null;
    return records ? records[id] : null;
  }

  function measure(node) {
    try {
      return node.getBBox();
    } catch (e) {
      return null;
    }
  }

  function clearAll() {
    groups.forEach(function(g) {
      if (g.parentNode) g.parentNode.removeChild(g);
    });
    groups = [];
    drawn = null;
  }

  return self;
}

// Knots are drawn, hit-tested and dragged in display coordinates, which are
// the layer's own only when it is not reprojected for display.
export function getDisplayShapes(target) {
  var lyr = target && target.gui && target.gui.displayLayer;
  return lyr && lyr.shapes ? lyr.shapes : target && target.shapes || [];
}

function copyAttribute(from, to, name) {
  var val = from.getAttribute(name);
  if (val) to.setAttribute(name, val);
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
