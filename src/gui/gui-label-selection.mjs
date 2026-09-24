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
// - An anchored label is a block of text: a box around it, plus a marker on
//   the anchor point when the anchor is neither drawn by the label nor covered
//   by the box. The anchor is worth showing there because it is what the text
//   is positioned against, and a position or a drag can put it well outside
//   the box -- see appendAnchoredCue().
// - A path label is a line of text on a curve: its own curve, stroked. A box
//   round a curve is mostly empty air and says very little about what is
//   selected. The curve already exists as a path in the layer's <defs> -- it is
//   what the text is laid along -- so this strokes a copy of it and is exact by
//   construction rather than by recomputation.
//
// See docs/development/label-tool-design.md.

var SVG_NS = 'http://www.w3.org/2000/svg';
// How far outside its text a label's outline is drawn. Exported because the
// tool grabs a label by the same box: what looks like the object is what takes
// a drag on it.
export var BOX_PADDING = 3;
var ANCHOR_RADIUS = 3.5;
var KNOT_RADIUS = 3;
var WIDTH_HANDLE_SIZE = 6;
var GAP_HANDLE_RADIUS = 2.5;

// How many labels get an outline before the cue falls back to the halo.
//
// Each outline costs a getBBox() on its text node. That is once per label per
// SVG redraw rather than once per frame -- navigation repositions the symbol
// layer instead of rebuilding it, and the cue moves with the map by wearing the
// label's own transform -- but a select-all on a big layer would still pay it,
// for an outline per label too small to tell apart anyway.
//
// Over the cap the selected labels wear a halo instead (.label-cue-marked),
// which is a class on the text node and costs no measurement. It says less
// than an outline -- no anchors, no knots, no box -- but a selection of
// hundreds is a group being restyled rather than objects being handled one by
// one, and the one thing it has to say is which labels are in it. This used to
// draw nothing at all, so selecting a whole layer left the map unchanged.
var MAX_OUTLINES = 200;

// getEditingId: returns the feature id of an open text editing session, or -1.
//   A label being typed into draws its own box and does not want a second one.
// getHandles: (optional) function(target, id, textBox) returning
//   {handles, column} for a selected anchored label, as from
//   getAnchoredLabelHandles(), or null. The tool decides when a label has
//   handles, and gives a text block's column from what is on screen, which
//   during a drag is not the data.
export function LabelSelection(gui, ext, hit, getEditingId, getHandles) {
  var self = {};
  var groups = []; // one <g> per drawn cue, in the layer's markup
  var marked = []; // text nodes wearing the halo, when there are too many to outline
  var drawn = null; // what those cues represent, so hover does not redraw them
  var on = false;
  var tetherId = -1; // the label whose text is being dragged off its anchor

  self.turnOn = function() {
    on = true;
    self.refresh();
  };

  self.turnOff = function() {
    on = false;
    tetherId = -1;
    clearAll();
  };

  // Draws a hairline from @id's anchor to its text while its offset is being
  // dragged, or nothing when given -1. The offset is what is being edited, and
  // on a label with no symbol the anchor is otherwise not drawn at all.
  self.setTether = function(id) {
    if (tetherId === id) return;
    tetherId = id;
    if (on) self.refresh(true);
  };

  // Redraws the cues against the current DOM. Called when the hit state changes
  // and when the map has been rendered, because a redraw replaces the layer's
  // markup and takes the old cues with it.
  self.refresh = function(force) {
    var target = hit.getHitTarget();
    var selected = on ? hit.getSelectionIds() : [];
    var tooMany = selected.length > MAX_OUTLINES;
    var ids = tooMany ? [] : selected;
    var hoverId = on ? getHoverId(selected) : -1;
    var key = selected.join(',') + '/' + hoverId + '/' + tetherId;
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
    // Too many to outline: a halo on the glyphs instead, which is the whole cue
    // for those labels.
    if (tooMany) markAll(target, selected);
  };

  // The label under the pointer, when showing it would say something: not one
  // already cued as selected, and not the one being typed into.
  function getHoverId(selectedIds) {
    var id = hit.getHitId();
    if (id < 0 || selectedIds.indexOf(id) > -1) return -1;
    if (getEditingId && getEditingId() === id) return -1;
    return id;
  }

  // Puts the halo on each selected label's glyphs. A class of its own rather
  // than the label_style mode's yellow one: that class is cleared on every
  // model update while the label tool is on, so the two would fight.
  function markAll(target, ids) {
    ids.forEach(function(id) {
      var nodes = findNodes(target, id);
      if (!nodes) return;
      nodes.text.classList.add('label-cue-marked');
      marked.push(nodes.text);
    });
  }

  function clearMarks() {
    marked.forEach(function(node) {
      node.classList.remove('label-cue-marked');
    });
    marked = [];
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
      appendAnchoredCue(g, nodes, rec, id, withHandles ? target : null);
    }
    groups.push(g);
  }

  // A box around the text, the anchor it is positioned against, and while the
  // two are being pulled apart, a line between them.
  //
  // The anchor is only marked when there is something to say: nothing else is
  // drawn there, and the text is somewhere other than on top of it. A label
  // that draws a symbol has the symbol, and a marker on top of it would
  // obscure what the label actually looks like; a label whose text sits over
  // its own anchor has the box, which says where it is more precisely than a
  // ring inside it would. What is left -- offset text with nothing at its
  // anchor -- is the case where the ring is the only thing that says what the
  // text hangs off.
  //
  // A selected label's handles go in a group of their own, after the symbol
  // rather than before it: they sit on the callout and on the edge of the box,
  // and painted beneath the line they would be hidden by it.
  //
  // @handleTarget: the layer, when the label is selected and so may have
  //   handles, or null
  //
  // A selected text block also shows its column, the width it wraps to, as a
  // fainter dashed box behind the solid one. The solid box is the label itself
  // -- the wrapped text, which is what a callout meets -- and is usually
  // narrower than its column; the column is what the width handle drags.
  function appendAnchoredCue(g, nodes, rec, id, handleTarget) {
    var box = measure(nodes.content);
    var o = box && handleTarget && getHandles ? getHandles(handleTarget, id, box) : null;
    var column = o ? o.column : null;
    if (!box) return;
    if (column) g.appendChild(columnRect(box, column, BOX_PADDING));
    if (box.width || box.height) g.appendChild(rect(box, BOX_PADDING));
    if (id === tetherId) g.appendChild(tether(box));
    if (!internal.featureHasSvgSymbol(rec) && !boxHoldsOrigin(box)) {
      g.appendChild(anchorMarker());
    }
    if (o && o.handles.length > 0) appendHandles(nodes, o.handles);
  }

  // The column's own extent across, and the text's up and down: a column has
  // no height of its own.
  function columnRect(box, column, pad) {
    var el = rect({x: column[0], y: box.y, width: column[1] - column[0],
      height: box.height}, pad);
    el.setAttribute('class', 'label-cue-column');
    return el;
  }

  function appendHandles(nodes, handles) {
    var g = document.createElementNS(SVG_NS, 'g');
    var transform = nodes.symbol.getAttribute('transform');
    var display = nodes.symbol.getAttribute('display');
    g.setAttribute('class', 'label-cue label-cue-handles');
    if (transform) g.setAttribute('transform', transform);
    if (display) g.setAttribute('display', display);
    handles.forEach(function(h) {
      g.appendChild(labelHandle(h));
    });
    nodes.symbol.parentNode.insertBefore(g, nodes.symbol.nextSibling);
    groups.push(g);
  }

  // A square for the width handle, which is a corner of the box, and a ring
  // for the callout's, which are points on its line -- filled for the end
  // that meets the text, so that the two ends of the line read differently.
  function labelHandle(h) {
    var p = h.point;
    var el;
    if (h.kind == 'width') {
      el = document.createElementNS(SVG_NS, 'rect');
      el.setAttribute('x', p[0] - WIDTH_HANDLE_SIZE / 2);
      el.setAttribute('y', p[1] - WIDTH_HANDLE_SIZE / 2);
      el.setAttribute('width', WIDTH_HANDLE_SIZE);
      el.setAttribute('height', WIDTH_HANDLE_SIZE);
    } else {
      el = document.createElementNS(SVG_NS, 'circle');
      el.setAttribute('cx', p[0]);
      el.setAttribute('cy', p[1]);
      el.setAttribute('r', h.kind == 'gap' ? GAP_HANDLE_RADIUS : KNOT_RADIUS);
    }
    el.setAttribute('class', 'label-cue-handle label-cue-' + h.kind);
    el.setAttribute('data-handle', h.kind);
    return el;
  }

  // Whether the label's anchor point is inside the box drawn around its text.
  // The group's own origin is the anchor, so this is a question about zero.
  function boxHoldsOrigin(box) {
    return box.x <= 0 && box.x + box.width >= 0 &&
      box.y <= 0 && box.y + box.height >= 0;
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
    return {symbol: symbol, text: text, content: content,
      pathId: getPathId(content)};
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

  // The line from the anchor to the text, drawn to the nearest corner or edge
  // of its box rather than to the middle of it: a line to the middle would run
  // underneath the glyphs it is pointing at.
  function tether(box) {
    var el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('x1', 0);
    el.setAttribute('y1', 0);
    el.setAttribute('x2', clamp(0, box.x - BOX_PADDING, box.x + box.width + BOX_PADDING));
    el.setAttribute('y2', clamp(0, box.y - BOX_PADDING, box.y + box.height + BOX_PADDING));
    el.setAttribute('class', 'label-cue-tether');
    return el;
  }

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
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
    clearMarks();
    drawn = null;
  }

  return self;
}
