import { internal } from './gui-core';

// Drawing which labels are selected for styling.
//
// The older label_style mode marks selected labels with a halo on the glyphs
// (text.label-style-selected). That reads as "this text is highlighted", which
// is fine for a mode whose only job is styling. The label tool needs it to read
// as "this is an object you have hold of", because one click selects a label
// and another reaches into its text -- so the cue is an outline around the
// object rather than a wash over the letters.
//
// Two shapes, because a label is one of two things:
//
// - An anchored label is a block of text: a box around it, plus a marker on the
//   anchor point itself when nothing else is drawn there. The anchor is worth
//   showing because it is what the text is positioned against, and label-pos
//   can put it well outside the box.
// - A path label is a line of text on a curve: its own curve, stroked. A box
//   round a curve is mostly empty air and says very little about what is
//   selected. The curve already exists as a path in the layer's <defs> -- it is
//   what the text is laid along -- so this strokes a copy of it and is exact by
//   construction rather than by recomputation.
//
// See docs/development/label-tool-design.md.

var SVG_NS = 'http://www.w3.org/2000/svg';
var BOX_PADDING = 3;
var ANCHOR_RADIUS = 3.5;
var KNOT_RADIUS = 3;

// How many labels get an outline before the cue falls back to the halo.
//
// Each outline costs a getBBox() on its text node. That is once per label per
// SVG redraw rather than once per frame -- navigation repositions the symbol
// layer instead of rebuilding it, and the cue moves with the map by wearing the
// label's own transform -- but a select-all on a big layer would still pay it,
// for an outline per label too small to tell apart anyway.
var MAX_OUTLINES = 200;

// getEditingId: returns the feature id of an open text editing session, or -1.
//   A label being typed into draws its own box and does not want a second one.
export function LabelSelection(gui, ext, hit, getEditingId) {
  var self = {};
  var groups = []; // one <g> per drawn cue, in the layer's markup
  var drawn = null; // what those cues represent, so hover does not redraw them
  var on = false;

  self.turnOn = function() {
    on = true;
    self.refresh();
  };

  self.turnOff = function() {
    on = false;
    clearAll();
  };

  // Redraws the cues against the current DOM. Called when the hit state changes
  // and when the map has been rendered, because a redraw replaces the layer's
  // markup and takes the old cues with it.
  self.refresh = function(force) {
    var target = hit.getHitTarget();
    var ids = on ? getDrawableIds() : [];
    var hoverId = on ? getHoverId(ids) : -1;
    var key = ids.join(',') + '/' + hoverId;
    // Hover fires on every pointer move, and most of them change nothing here.
    if (!force && drawn === key) return;
    clearAll();
    drawn = key;
    if (!target) return;
    // The hovered label goes first, so that a selected label drawn over it wins
    // if the two are ever the same.
    if (hoverId > -1) draw(target, hoverId, 'label-cue-hovered');
    ids.forEach(function(id) {
      // Knot handles go on selected curves only. A hovered label is being
      // pointed at, not held, and dotting a curve the pointer merely crossed
      // would offer handles that cannot be grabbed.
      draw(target, id, 'label-cue-selected', true);
    });
  };

  // The label under the pointer, when showing it would say something: not one
  // already cued as selected, and not the one being typed into.
  function getHoverId(selectedIds) {
    var id = hit.getHitId();
    if (id < 0 || selectedIds.indexOf(id) > -1) return -1;
    if (getEditingId && getEditingId() === id) return -1;
    return id;
  }

  // The selected labels, or none if there are too many to outline usefully.
  function getDrawableIds() {
    var ids = hit.getSelectionIds();
    return ids.length > MAX_OUTLINES ? [] : ids;
  }

  function draw(target, id, className, withHandles) {
    var nodes = findNodes(target, id);
    var rec = getRecord(target, id);
    var g;
    if (!nodes || !rec) return;
    g = makeGroup(nodes, className);
    if (nodes.pathId) {
      g.appendChild(curve(nodes.pathId));
      if (withHandles) appendKnotHandles(g, target, id);
    } else {
      appendBox(g, nodes.content);
      // An icon already marks the anchor; a second marker on top of it would
      // only obscure what the label actually looks like. The marker doubles as
      // the anchor's drag handle, so a label wearing an icon is grabbed by the
      // icon itself.
      if (!rec.icon) g.appendChild(anchorMarker());
    }
    groups.push(g);
  }

  // A dot on each knot of a selected curve, so that what can be grabbed is
  // what can be seen.
  //
  // These are placed in the same coordinate space as the curve beside them --
  // the space inside the symbol group -- by the same mapping the renderer used
  // to build the curve, rather than by reading positions back out of the path.
  function appendKnotHandles(g, target, id) {
    var shp = target.shapes && target.shapes[id];
    var coords, i;
    if (!shp || shp.length < 2) return;
    coords = internal.svg.getLabelPathCoords(shp, ext.getTransform(),
      ext.getSymbolScale());
    for (i = 0; i < coords.length; i++) {
      g.appendChild(knotHandle(coords[i]));
    }
  }

  function appendBox(g, content) {
    var box = measure(content);
    if (!box || !box.width && !box.height) return;
    g.appendChild(rect(box, BOX_PADDING));
  }

  function findNodes(target, id) {
    var container = target.gui && target.gui.svg_container;
    // Qualified by the symbol class because an editing session's hit region
    // carries the same data-id, as the hit test requires.
    var symbol = container && container.querySelector(
      '.mapshaper-svg-symbol[data-id="' + id + '"]');
    var text = !symbol ? null :
      symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    var content;
    if (!text) return null;
    content = text.querySelector('textPath') || text;
    return {symbol: symbol, content: content, pathId: getPathId(content)};
  }

  // The id of the baseline a path label is laid along, or null for an anchored
  // one. This is what tells the two kinds apart here: the geometry is the same
  // multipoint either way, but only a path label renders a <textPath>.
  function getPathId(content) {
    var href = content.tagName != 'textPath' ? null :
      content.getAttribute('href') || content.getAttribute('xlink:href');
    return href && href.charAt(0) == '#' ? href.substr(1) : null;
  }

  function getRecord(target, id) {
    var records = target.data ? target.data.getRecords() : null;
    return records ? records[id] : null;
  }

  // A sibling of the label's symbol node, wearing its transform so that the cue
  // moves and hides with it, and inserted before it so the outline paints
  // beneath the glyphs.
  function makeGroup(nodes, className) {
    var g = document.createElementNS(SVG_NS, 'g');
    var transform = nodes.symbol.getAttribute('transform');
    var display = nodes.symbol.getAttribute('display');
    g.setAttribute('class', 'label-cue ' + className);
    if (transform) g.setAttribute('transform', transform);
    if (display) g.setAttribute('display', display);
    nodes.symbol.parentNode.insertBefore(g, nodes.symbol);
    return g;
  }

  function measure(node) {
    try {
      return node.getBBox();
    } catch (e) {
      return null; // an unrendered node has no box to report
    }
  }

  function rect(box, pad) {
    var el = document.createElementNS(SVG_NS, 'rect');
    el.setAttribute('x', box.x - pad);
    el.setAttribute('y', box.y - pad);
    el.setAttribute('width', box.width + pad * 2);
    el.setAttribute('height', box.height + pad * 2);
    el.setAttribute('class', 'label-cue-box');
    return el;
  }

  function anchorMarker() {
    var el = document.createElementNS(SVG_NS, 'circle');
    // The group's own origin is the anchor point, so the marker sits at 0,0.
    el.setAttribute('cx', 0);
    el.setAttribute('cy', 0);
    el.setAttribute('r', ANCHOR_RADIUS);
    el.setAttribute('class', 'label-cue-anchor');
    return el;
  }

  function knotHandle(p) {
    var el = document.createElementNS(SVG_NS, 'circle');
    el.setAttribute('cx', p[0]);
    el.setAttribute('cy', p[1]);
    el.setAttribute('r', KNOT_RADIUS);
    el.setAttribute('class', 'label-cue-knot');
    return el;
  }

  function curve(pathId) {
    var el = document.createElementNS(SVG_NS, 'use');
    el.setAttribute('href', '#' + pathId);
    el.setAttribute('class', 'label-cue-curve');
    return el;
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
