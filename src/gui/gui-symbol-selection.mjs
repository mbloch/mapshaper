import { internal } from './gui-core';

// The symbol tool's hover and selection cues, drawn in the layer's SVG beside
// each symbol: a halo like the one the line and polygon tools put around a
// shape, and a ring on each knot of a selected curve.
//
// A layer of canvas-drawn circles has no SVG to draw into; its halos are drawn
// by the overlay instead, in the same colors (see getOverlayLayers()).

var SVG_NS = 'http://www.w3.org/2000/svg';
var KNOT_RADIUS = 3.2;
// The overlay's halos (gui-overlay-styler.mjs): how far a halo reaches past
// the edge of an icon or each side of a curve, in px, and its colors
var ICON_HALO = 5;
var CURVE_HALO = 2.5;
var HALO_SHAPES = 'circle,ellipse,rect,path,polygon,polyline,line';
var haloStyles = {
  selected: {color: 'rgb(255, 198, 0)', opacity: 0.25},
  hovered: {color: 'black', opacity: 0.1}
};

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
      draw(target, state.hoverId, false);
    }
    state.selected.forEach(function(id) {
      draw(target, id, true);
    });
  };

  function draw(target, id, selected) {
    var node = findNode(target, id);
    var shp = getDisplayShapes(target)[id];
    var isCurve, halo, g;
    if (!node || !shp || !isSymbol(target, id)) return;
    isCurve = internal.svg.shapeIsCurve(shp, getRecord(target, id));
    halo = makeHalo(node, isCurve ? CURVE_HALO : ICON_HALO, getHaloStyle(selected));
    halo.classList.add(selected ? 'symbol-halo-selected' : 'symbol-halo-hovered');
    // beneath the symbol, so that it is seen in its own colors
    node.parentNode.insertBefore(halo, node);
    groups.push(halo);
    if (isCurve && selected) {
      g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'label-cue symbol-cue label-cue-selected');
      copyAttribute(node, g, 'transform');
      copyAttribute(node, g, 'display');
      appendKnots(g, shp);
      node.parentNode.insertBefore(g, node.nextSibling);
      groups.push(g);
    }
  }

  function getHaloStyle(selected) {
    return selected ? haloStyles.selected : haloStyles.hovered;
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

// A copy of a symbol's shapes, each stroked @reach px wider on each side than
// it is drawn, with no fill: beneath the symbol, a band around its edge. The
// group's opacity, rather than each stroke's, keeps overlapping strokes (an
// arrowhead on its curve) from showing darker where they cross.
export function makeHalo(node, reach, style) {
  var g = document.createElementNS(SVG_NS, 'g');
  var halo = node.cloneNode(true);
  // a symbol is a group of shapes, or a single shape
  var shapes = node.matches(HALO_SHAPES) ? [node] : node.querySelectorAll(HALO_SHAPES);
  var copies = node.matches(HALO_SHAPES) ? [halo] : halo.querySelectorAll(HALO_SHAPES);
  var scale = getScale(node);
  halo.removeAttribute('data-id');
  halo.removeAttribute('class');
  halo.removeAttribute('opacity');
  g.setAttribute('class', 'label-cue symbol-cue symbol-halo');
  g.setAttribute('opacity', style.opacity);
  g.appendChild(halo);
  halo.querySelectorAll('text,image').forEach(function(el) {
    el.parentNode.removeChild(el);
  });
  copies.forEach(function(el, i) {
    var width = getStrokeWidth(shapes[i]) + reach * 2 / scale;
    el.removeAttribute('marker-start');
    el.removeAttribute('marker-end');
    el.setAttribute('style', 'fill: none; stroke: ' + style.color +
      '; stroke-opacity: 1; opacity: 1; stroke-dasharray: none; stroke-linejoin: round;' +
      ' stroke-linecap: round; stroke-width: ' + width + 'px;');
  });
  return g;
}

function getStrokeWidth(el) {
  var style = window.getComputedStyle(el);
  if (!style.stroke || style.stroke == 'none') return 0;
  return parseFloat(style.strokeWidth) || 0;
}

// map px per unit inside the symbol's group, which a symbol's size can scale
function getScale(node) {
  var m = node.getCTM && node.getCTM();
  return m ? Math.hypot(m.a, m.b) || 1 : 1;
}

function copyAttribute(from, to, name) {
  var val = from.getAttribute(name);
  if (val) to.setAttribute(name, val);
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
