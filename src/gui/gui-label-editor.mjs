import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { getLabelTextCommand, getLabelDeleteCommand } from './gui-label-commands';
import { renderPendingSymbol } from './gui-svg-symbols';
import {
  decodeLabelText, encodeLabelText, getRenderedLines, getRenderedContent,
  getRenderedCaret, getRenderedLength, getEditIndex, textHasNoGlyphs,
  readSoftBreaks, insertSoftBreaks, sameSoftBreaks,
  LINES_STACKED, LINES_JOINED
} from './gui-label-text';
import { getSoftBreaks } from './gui-label-wrap';
import { getLabelColumn } from './gui-label-handles';
import {
  getCaretGeometry, getSelectionRects, getLabelBox, getCaretIndexAtPoint,
  growBoxToCaret
} from './gui-label-caret';
import { setLabelTextSession } from './gui-label-style-state';
// Editing label text in place.
//
// An offscreen <textarea> holds focus and is the model of record for the whole
// session: native keyboard handling, selection, clipboard, IME and text-level
// undo all come from it, and none of them have to be reimplemented against SVG.
// On every keystroke its value is written into the real SVG text node, so the
// thing being edited is the thing that renders and exports.
//
// The caret and selection are drawn from the SVG character position APIs. Those
// behave the same on <text> and on <text><textPath>, which is what makes one
// editor serve both kinds of label.
//
// A session runs in one of two modes. An existing label is edited in place, and
// the commit writes its text. A *pending* label has no feature yet: it is drawn
// by the renderer from a record the tool has not saved, and it becomes a feature
// only if the session ends with something to show. See "pending" below.
//
// See docs/development/label-tool-design.md.

var SVG_NS = 'http://www.w3.org/2000/svg';
var XML_NS = 'http://www.w3.org/XML/1998/namespace';
var BOX_PADDING = 3;

// Prefix for the ids of a pending label's own <defs>, kept away from the ones
// the layer generates so a pending curve cannot be mistaken for a real one.
var PENDING_ID_PREFIX = '__pending';

export function LabelEditor(gui, ext) {
  var self = this;
  var textarea = null;
  var session = null;

  // Opens a session on feature @id of @target, a hit target layer.
  //
  // @opts.onClose is called once the session has ended, which is how the tool
  // decides what the label goes back to being -- selected for styling, or
  // nothing. The session can end from inside the editor (Escape, Enter, blur),
  // so the tool cannot do this at its own call sites.
  self.open = function(target, id, opts) {
    var rec = getRecord(target, id);
    if (!rec) return false;
    self.close();
    session = {
      target: target,
      id: id,
      pending: null,
      created: false,
      onClose: opts && opts.onClose || null,
      startText: decodeLabelText(rec['label-text']),
      startBreaks: readSoftBreaks(rec['label-text']).breaks,
      nodes: null
    };
    startSession();
    return true;
  };

  // Opens a session on a label that does not exist yet, at @coords in the
  // layer's display coordinates.
  //
  // Nothing is written to the data here, and nothing will be unless the session
  // ends with a glyph in it. Placing a label is a gesture that can be thought
  // better of -- it is one click, and taking it back is one press of Escape --
  // so the click cannot be the thing that commits a feature. Deferring is what
  // makes an abandoned label leave *nothing*: no feature, no layer, no command,
  // no history entry, and nothing that has to be cleaned up afterwards by a
  // mechanism that might be switched off.
  //
  // What the user sees in the meantime is a real rendered label, drawn from a
  // record the tool has not saved (see renderPendingSymbol). The editor cannot
  // tell the difference, so the caret, box, curve and hit region all work as
  // they do for a committed label.
  //
  // @opts.getStyle: returns the style the label should wear, read on every
  //   render so that setting a font or a position before typing is visible
  // @opts.create: runs the command that creates the label, as
  //   create(text, done); the tool owns which layer a new label goes into
  self.openPending = function(target, opts) {
    if (!target || !opts || !opts.coords || !opts.coords.length) return false;
    self.close();
    session = {
      target: target,
      id: -1,
      pending: {
        coords: opts.coords,
        getStyle: opts.getStyle || function() { return {}; },
        create: opts.create,
        group: null
      },
      // A pending label came from nothing, and if it is committed it goes back
      // to nothing rather than into the styling selection: the panel should be
      // describing the next label, not the one just written.
      created: true,
      onClose: opts.onClose || null,
      startText: '',
      startBreaks: [],
      nodes: null
    };
    startSession();
    return true;
  };

  function startSession() {
    session.text = session.startText;
    getTextarea().value = session.text;
    setCaret(session.text.length, session.text.length);
    focusTextarea();
    // A pending label has no id for the panel to style, so the panel holds the
    // style for the next label instead and this session renders it.
    setLabelTextSession(gui, {
      id: session.id,
      refocus: focusTextarea,
      // A pending label is drawn from the panel's style, so the panel needs a
      // way to redraw it when that style changes.
      refresh: self.refresh
    });
    self.refresh();
  }

  self.isOpen = function() {
    return !!session;
  };

  self.getFeatureId = function() {
    return session ? session.id : -1;
  };

  // The label's first knot, in the layer's display coordinates, or null. The
  // tool maps pointer positions into the label's own space with it.
  self.getAnchorCoords = function() {
    if (!session) return null;
    if (session.pending) return session.pending.coords[0];
    return getFeatureAnchor(session.target, session.id);
  };

  // Whether @node is part of the label this session is editing: its text, or
  // the region around it that keeps a near miss inside the session.
  //
  // How a click on a committed label is recognized is by its feature id, which
  // a pending label does not have. Asking the DOM works for both, and for the
  // pending case it is the only thing that can be asked.
  self.ownsNode = function(node) {
    var groups = session && session.groups;
    if (!node || !session) return false;
    // closest() rather than contains(), so that a node belonging to a group
    // that has since been replaced still counts as this session's. A click
    // arriving just after a redraw is holding one of those.
    if (session.pending && node.closest &&
      node.closest('.label-edit-pending')) return true;
    return !!groups && (groups.hit.contains(node) || groups.back.contains(node) ||
      groups.front.contains(node));
  };

  // Ends the session without writing anything back, for a caller that is about
  // to take the label away. Committing first would either save text to a
  // feature that is about to stop existing, or -- if the text had been emptied
  // -- delete the feature itself and leave the caller's own delete pointed at
  // whichever label moved up into the gap.
  //
  // onClose is not called for the same reason: its job is to decide what the
  // label goes back to being, and the answer here is nothing.
  self.cancel = function() {
    var o = session;
    if (!o) return;
    session = null;
    setLabelTextSession(gui, null);
    removeOverlay(o);
    if (textarea) textarea.blur();
  };

  // Ends the session, saving the text if it changed.
  self.close = function() {
    var o = session;
    if (!o) return;
    session = null;
    setLabelTextSession(gui, null);
    removeOverlay(o);
    if (textarea) textarea.blur();
    commit(o);
    if (o.onClose) o.onClose(o);
  };

  // Rebuilds the overlay against the current DOM. A map redraw replaces the
  // layer's markup wholesale, so the nodes have to be found again and the
  // in-progress text written back into the fresh ones -- the textarea is the
  // model of record, not the node.
  self.refresh = function() {
    if (!session) return;
    session.nodes = findNodes(session);
    if (!session.nodes) return;
    session.layout = undefined; // resolved from the nodes, which just changed
    writeText(session);
    drawOverlay(session);
  };

  // Moves the caret to the character under a click, in the label's own
  // coordinate space. Returns true if the click landed on the text.
  self.setCaretAtPoint = function(p) {
    var provider, layout, rendered, i;
    if (!session || !session.nodes) return false;
    provider = getProvider(session.nodes);
    layout = getLayout(session);
    rendered = getRenderedLength(session.text, layout);
    i = getCaretIndexAtPoint(provider, p, rendered);
    if (i < 0) return false;
    i = getEditIndex(session.text, i, layout);
    setCaret(i, i);
    drawOverlay(session);
    return true;
  };

  // What a closing session does to the label it was editing: creates it, saves
  // its text, removes it, or does nothing at all.
  //
  // A label that draws no glyphs is not a label. It puts no mark on the map, so
  // it cannot be seen, clicked or selected, and the only way to discover one is
  // to export the layer and read the geometry. Leaving one behind is a way to
  // accumulate invisible features, which is why no session ever stores a blank
  // string.
  //
  // The four cases:
  //
  // - A pending label with text is **created** here, by the one command that
  //   writes its geometry, its style and its text together. This is the only
  //   place a label is created, and it cannot run without a glyph to show.
  // - A pending label with no text does **nothing**. There is no feature, no
  //   layer, no command and no history entry to take back: placing a label and
  //   thinking better of it costs exactly nothing, in the same way that
  //   abandoning a half-drawn curve does.
  // - An existing label emptied of its text is **removed** by a command, since
  //   there is no session to abandon -- it was created before this one, perhaps
  //   by the script the file was built by.
  // - An existing label whose text changed has that text **saved**.
  //
  // A text block is saved with the soft breaks it was last drawn with, and is
  // saved even when the typed text did not change if those breaks did: a font
  // installed since, or a width set from the console, moves them.
  function commit(o) {
    var blank = textHasNoGlyphs(o.text);
    var breaks = getBreaks(o);
    if (o.pending) {
      if (!blank) o.pending.create(insertSoftBreaks(o.text, breaks));
      return;
    }
    if (blank) {
      o.removed = true;
      removeLabel(o);
      return;
    }
    if (o.text === o.startText && sameSoftBreaks(breaks, o.startBreaks)) return;
    runGuiEditCommand(gui, getLabelTextCommand(insertSoftBreaks(o.text, breaks),
      o.id, o.target.name), {
      title: 'Label text'
    });
  }

  // Where the session's text wraps, as offsets into it. Only an anchored label
  // wraps: a path label's text runs along its curve on one line.
  function getBreaks(o) {
    var shp = o.pending ? o.pending.coords : o.target.shapes && o.target.shapes[o.id];
    var rec;
    if (!shp || shp.length > 1) return [];
    rec = o.pending ? o.pending.getStyle() : getRecord(o.target, o.id);
    return getSoftBreaks(o.text, rec);
  }

  // Deletes the label's feature, geometry and all.
  //
  // -filter is the command for this: dropping a feature is not a label
  // operation, and a label with no text is an ordinary point feature as far as
  // the data model is concerned. It shifts the ids of every later feature, which
  // is inherent to deleting one and is why the tool must not re-select this
  // label's id afterwards -- see o.removed.
  //
  // A command rather than an undo, so that it works the same whether or not the
  // session's undo history is being kept: undo is a setting, and a rule about
  // what may exist in the data cannot depend on one.
  function removeLabel(o) {
    runGuiEditCommand(gui, getLabelDeleteCommand(o.id, o.target.name), {
      title: 'Remove empty label'
    });
  }

  function getFeatureAnchor(target, id) {
    var shp = target && target.shapes ? target.shapes[id] : null;
    return shp && shp[0] || null;
  }

  function getRecord(target, id) {
    var records = target && target.data ? target.data.getRecords() : null;
    return records ? records[id] : null;
  }

  // The nodes an editing session works against: the symbol group that carries
  // the map transform, the <text>, and the element whose characters are the
  // label's text -- the <textPath> for a path label, the <text> itself
  // otherwise.
  function findNodes(o) {
    var container = getContainer(o);
    var symbol;
    if (o.pending) return findPendingNodes(o, container);
    // Qualified by the symbol class, because the session's own hit region also
    // carries the feature's data-id -- it has to, for the hit test to resolve
    // a click on it to this label.
    symbol = container && container.querySelector(
      '.mapshaper-svg-symbol[data-id="' + o.id + '"]');
    return symbol ? readNodes(symbol) : null;
  }

  // The nodes of a pending label, drawn here because no layer contains it.
  //
  // Rebuilt rather than kept, because the markup depends on the style the panel
  // is set to and on the map's transform, both of which can change under an open
  // session; and because a map render replaces the layer's markup wholesale and
  // takes any node inside it along. That is the same reason a committed label's
  // nodes are looked up again on every refresh.
  // Rebuilt only when the markup would differ, which matters for more than
  // speed. refresh() runs on every map render, and a hover is a render: a group
  // rebuilt between a click's mousedown and the click itself would leave the
  // node the click came from detached, and the session would not recognize a
  // click on its own label. Reusing identical markup keeps those nodes alive.
  function findPendingNodes(o, container) {
    var markup;
    if (!container) return null;
    markup = renderPendingSymbol(getPendingRecord(o), o.pending.coords, ext,
      PENDING_ID_PREFIX);
    if (!markup) {
      removePendingGroup(o);
      return null;
    }
    if (o.pending.group && o.pending.markup === markup &&
      o.pending.group.parentNode === container) {
      return readNodes(o.pending.group.querySelector('.mapshaper-pending-symbol'));
    }
    removePendingGroup(o);
    o.pending.markup = markup;
    o.pending.group = document.createElementNS(SVG_NS, 'g');
    o.pending.group.setAttribute('class', 'label-edit-pending');
    o.pending.group.innerHTML = markup;
    container.appendChild(o.pending.group);
    return readNodes(o.pending.group.querySelector('.mapshaper-pending-symbol'));
  }

  // The record a pending label would be created with: the panel's style for the
  // next label, plus the text so far. The renderer substitutes the placeholder
  // when there is no text, exactly as it does for a committed empty label.
  function getPendingRecord(o) {
    var rec = Object.assign({}, o.pending.getStyle());
    // With its soft breaks, so that what is aligned and what a callout meets
    // is the block as wrapped
    rec['label-text'] = encodeLabelText(insertSoftBreaks(o.text, getBreaks(o)));
    // No need to expand label-pos here, or to measure its text: the renderer
    // resolves the position and asks for the width it needs, so a pending
    // label is laid out by exactly the same code as a committed one.
    return rec;
  }

  function removePendingGroup(o) {
    var g = o.pending && o.pending.group;
    if (g && g.parentNode) g.parentNode.removeChild(g);
    if (o.pending) o.pending.group = null;
  }

  function readNodes(symbol) {
    var text = !symbol ? null :
      symbol.tagName == 'text' ? symbol : symbol.querySelector('text');
    if (!text) return null;
    return {
      symbol: symbol,
      text: text,
      content: text.querySelector('textPath') || text
    };
  }

  // Where a session's nodes live. A committed label is inside its layer's
  // group; a pending one belongs to no layer -- and the layer it will go into
  // may not even exist yet, or may be a polyline layer with no SVG group at all
  // -- so it is drawn into the map's shared <svg> instead. A symbol positions
  // itself with its own transform, so the two are equivalent for drawing.
  function getContainer(o) {
    if (o.pending) return gui.map.getSvgRoot();
    return o.target.gui && o.target.gui.svg_container;
  }

  // Writes the session's text into the SVG, so that what is on screen is what
  // will be saved.
  //
  // Every character the user typed has to end up as a character the text engine
  // laid out, or the caret cannot be put after it. Two kinds of character do not
  // survive being written naively, and both of them are ones people type
  // constantly:
  //
  //   - Spaces. SVG's default whitespace handling collapses runs and drops
  //     leading and trailing ones, so typing a space moved no glyphs and left
  //     the caret where it was. xml:space stops that.
  //   - Line breaks. An empty <tspan> lays out nothing, so a line just opened
  //     with Enter had no position for the caret to move to. The placeholder in
  //     getRenderedLines() gives it one.
  function writeText(o) {
    var content = o.nodes.content;
    var breaks = getBreaks(o);
    var written = o.text + '\u0000' + breaks.join(',');
    var lines, i, tspan;
    // refresh() runs on every map render, which during a pan is every frame;
    // rebuilding text nodes that already say the right thing is pure waste
    if (o.writtenTo === content && o.writtenText === written) return;
    o.writtenTo = content;
    o.writtenText = written;
    o.nodes.text.setAttributeNS(XML_NS, 'space', 'preserve');
    while (content.firstChild) content.removeChild(content.firstChild);
    // A <textPath> runs along its baseline, so a second line would advance
    // along the curve rather than drop below it. Enter commits instead of
    // adding one, but text can still arrive with breaks in it -- from a paste,
    // or from a label that was multi-line before it was given a path -- and
    // turning them into spaces is what export does too.
    if (getLayout(o) === LINES_JOINED) {
      content.appendChild(document.createTextNode(getRenderedContent(o.text)));
      return;
    }
    // A soft break keeps the space it broke at at the end of its line, where
    // the rendered label drops it: here every typed character has to be one
    // the caret can sit beside.
    lines = getRenderedLines(o.text, breaks);
    content.appendChild(document.createTextNode(lines[0]));
    for (i = 1; i < lines.length; i++) {
      tspan = document.createElementNS(SVG_NS, 'tspan');
      tspan.setAttribute('x', o.nodes.text.getAttribute('x') || 0);
      tspan.setAttribute('dy', getLineHeight(o));
      tspan.appendChild(document.createTextNode(lines[i]));
      content.appendChild(tspan);
    }
  }

  // Cached per session: asking costs a record lookup and a geometry test, and
  // the answer cannot change while a session is open.
  function getLayout(o) {
    if (o.layout === undefined) {
      o.layout = o.nodes && o.nodes.content.tagName == 'textPath' ?
        LINES_JOINED : LINES_STACKED;
    }
    return o.layout;
  }

  function getLineHeight(o) {
    var rec = o.pending ? o.pending.getStyle() : getRecord(o.target, o.id);
    return internal.svg.getLineHeightDy(rec && rec['line-height']);
  }

  function getProvider(nodes) {
    var content = nodes.content;
    var text = nodes.text;
    return {
      startOfChar: function(i) { return content.getStartPositionOfChar(i); },
      endOfChar: function(i) { return content.getEndPositionOfChar(i); },
      rotationOfChar: function(i) { return content.getRotationOfChar(i); },
      extentOfChar: function(i) { return content.getExtentOfChar(i); },
      charAtPoint: function(p) { return content.getCharNumAtPosition(p); },
      renderedCount: function() { return content.getNumberOfChars(); },
      fontSize: function() { return getFontSize(text); },
      anchor: function() { return getAnchor(nodes); }
    };
  }

  // Where an empty label's caret goes. The placeholder gives the text engine
  // something to lay out, so its position is usually available even though it
  // has no advance; the element's own x/y is the fallback.
  function getAnchor(nodes) {
    var p = null;
    try {
      p = nodes.content.getStartPositionOfChar(0);
    } catch (e) {
      p = null;
    }
    if (p && isFinite(p.x) && isFinite(p.y)) return {x: p.x, y: p.y};
    return {
      x: parseFloat(nodes.text.getAttribute('x')) || 0,
      y: parseFloat(nodes.text.getAttribute('y')) || 0
    };
  }

  function getFontSize(text) {
    var val = window.getComputedStyle(text).fontSize;
    return parseFloat(val) || 12;
  }

  function drawOverlay(o) {
    var provider = getProvider(o.nodes);
    var layout = getLayout(o);
    var rendered = getRenderedLength(o.text, layout);
    var caret = getCaretGeometry(provider,
      getRenderedCaret(o.text, getCaretStart(), layout));
    var box = growBoxToCaret(
      getLabelBox(provider, measure(o.nodes.content), rendered, BOX_PADDING),
      caret, BOX_PADDING);
    var groups = getGroups(o);
    var bands = getSelectedRenderedRange(o);
    var pathId = getLabelPathId(o.nodes);
    clear(groups.back);
    clear(groups.front);
    // The selection band and the box paint beneath the glyphs and the caret
    // above them, which is why the overlay is two groups rather than one.
    // The box is the anchored label's way of being visible while it is still
    // empty. A path label has the ghosted curve for that, and a rectangle
    // around curved text encloses mostly empty air, so it gets one or the
    // other rather than both.
    if (pathId) {
      groups.back.appendChild(ghostPath(pathId));
    } else if (box) {
      appendColumn(o, groups.back, box);
      groups.back.appendChild(rect(box, 'label-edit-box'));
    }
    getSelectionRects(provider, bands[0], bands[1], rendered).forEach(function(r) {
      groups.back.appendChild(rect(r, 'label-edit-selection'));
    });
    if (caret) groups.front.appendChild(caretLine(caret));
    drawHitRegion(o, groups.hit, box, caret, pathId);
    syncTransform(o, groups);
  }

  // A text block's column -- the width it wraps to -- as a faint dashed box
  // behind the box around the text, which is usually narrower. Without it a
  // text block just placed looks like any other label: a caret in a box the
  // size of nothing.
  function appendColumn(o, g, box) {
    var rec = o.pending ? getPendingRecord(o) : getRecord(o.target, o.id);
    var column = rec ? getLabelColumn(rec) : null;
    if (!column) return;
    g.appendChild(rect({
      x: column[0] - BOX_PADDING,
      y: box.y,
      width: column[1] - column[0] + BOX_PADDING * 2,
      height: box.height
    }, 'label-edit-column'));
  }

  // Keeps clicks near the label inside the session instead of ending it.
  //
  // Glyph-precise hit testing is not enough for this: a curved label's bounding
  // box is mostly empty air, and even on a straight one the natural gesture for
  // putting the caret at the end of the text lands just past the last glyph. A
  // click that misses by a pixel would dismiss the session.
  //
  // The region carries the feature's data-id so that the existing hit test
  // resolves a click on it to this label, and it goes after the symbol node so
  // that document order still finds the real symbol first.
  // A faint copy of the curve the text is set along, shown for as long as the
  // label is open. Without it the path is only visible in the shape of the
  // text, which says nothing about where the text can still go -- and on a
  // label that has just been placed, with nothing typed into it yet, there is
  // nothing on screen at all. Drawn from the same <defs> path the <textPath>
  // references, so it cannot drift from the text it belongs to.
  function ghostPath(pathId) {
    var el = document.createElementNS(SVG_NS, 'use');
    el.setAttribute('href', '#' + pathId);
    el.setAttribute('class', 'label-edit-path');
    return el;
  }

  function drawHitRegion(o, g, box, caret, pathId) {
    var el;
    clear(g);
    if (box) g.appendChild(rect(box, 'label-edit-hit-area'));
    if (!pathId) return;
    // A thickened, transparent copy of the baseline: about one em wide, so that
    // the region follows the curve rather than boxing it.
    el = document.createElementNS(SVG_NS, 'use');
    el.setAttribute('href', '#' + pathId);
    el.setAttribute('class', 'label-edit-hit-baseline');
    el.setAttribute('stroke-width', caret ? caret.ascent + caret.descent : 12);
    g.appendChild(el);
  }

  function getLabelPathId(nodes) {
    var href = nodes.content.tagName != 'textPath' ? null :
      nodes.content.getAttribute('href') ||
      nodes.content.getAttribute('xlink:href');
    return href && href.charAt(0) == '#' ? href.substr(1) : null;
  }

  // The selected range in rendered characters, which is what the geometry works
  // in. Line breaks are not rendered, so the two index spaces differ.
  function getSelectedRenderedRange(o) {
    var layout = getLayout(o);
    var from = getRenderedCaret(o.text, getCaretStart(), layout);
    var to = getRenderedCaret(o.text, getCaretEnd(), layout);
    var a = from.index + (from.atEnd ? 1 : 0);
    var b = to.index + (to.atEnd ? 1 : 0);
    return [Math.min(a, b), Math.max(a, b)];
  }

  function measure(node) {
    try {
      return node.getBBox();
    } catch (e) {
      return null; // an unrendered node has no box to report
    }
  }

  // Sibling groups around the label's symbol node, so that they inherit nothing
  // and are positioned by copying its transform.
  //
  // There are two drawing groups rather than one because the z-order matters:
  // the selection band has to paint beneath the glyphs and the caret above
  // them. A single group would draw the band over the text and obscure it.
  function getGroups(o) {
    var parent = o.nodes.symbol.parentNode;
    var after;
    if (!o.groups || o.groups.back.parentNode !== parent) {
      o.groups = {
        back: makeGroup('label-edit-overlay label-edit-back'),
        front: makeGroup('label-edit-overlay label-edit-front'),
        hit: makeGroup('label-edit-hit')
      };
      // A pending label has no feature for a click to resolve to, so it has no
      // data-id either; the tool recognizes a click on it by asking whether the
      // editor owns the node -- see self.ownsNode().
      if (o.id > -1) o.groups.hit.setAttribute('data-id', o.id);
      parent.insertBefore(o.groups.back, o.nodes.symbol);
      after = o.nodes.symbol.nextSibling;
      parent.insertBefore(o.groups.front, after);
      parent.insertBefore(o.groups.hit, after);
    }
    return o.groups;
  }

  function makeGroup(className) {
    var g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', className);
    return g;
  }

  // The overlay is drawn in the label's own coordinate space, so it moves with
  // the map by wearing the same transform as the label -- and hides with it when
  // the label scrolls out of view.
  function syncTransform(o, groups) {
    var transform = o.nodes.symbol.getAttribute('transform');
    var display = o.nodes.symbol.getAttribute('display');
    [groups.back, groups.front, groups.hit].forEach(function(g) {
      if (transform) g.setAttribute('transform', transform);
      if (display) {
        g.setAttribute('display', display);
      } else {
        g.removeAttribute('display');
      }
    });
  }

  function removeOverlay(o) {
    removePendingGroup(o);
    if (!o.groups) return;
    [o.groups.back, o.groups.front, o.groups.hit].forEach(function(g) {
      if (g.parentNode) g.parentNode.removeChild(g);
    });
    o.groups = null;
  }

  function clear(g) {
    while (g.firstChild) g.removeChild(g.firstChild);
  }

  function rect(box, className) {
    var el = document.createElementNS(SVG_NS, 'rect');
    el.setAttribute('x', box.x);
    el.setAttribute('y', box.y);
    el.setAttribute('width', box.width);
    el.setAttribute('height', box.height);
    el.setAttribute('class', className);
    return el;
  }

  function caretLine(caret) {
    var el = document.createElementNS(SVG_NS, 'line');
    el.setAttribute('x1', caret.x);
    el.setAttribute('y1', caret.y - caret.ascent);
    el.setAttribute('x2', caret.x);
    el.setAttribute('y2', caret.y + caret.descent);
    el.setAttribute('class', 'label-edit-caret');
    if (caret.angle) {
      // a curved label's caret leans with the glyph it sits beside
      el.setAttribute('transform',
        'rotate(' + caret.angle + ' ' + caret.x + ' ' + caret.y + ')');
    }
    return el;
  }

  function getTextarea() {
    if (textarea) return textarea;
    textarea = document.createElement('textarea');
    textarea.setAttribute('class', 'label-edit-input');
    textarea.setAttribute('wrap', 'off');
    textarea.setAttribute('spellcheck', 'false');
    textarea.setAttribute('autocomplete', 'off');
    textarea.setAttribute('autocapitalize', 'off');
    gui.container.node().appendChild(textarea);

    textarea.addEventListener('input', function() {
      if (!session) return;
      session.text = textarea.value;
      self.refresh();
    });

    // Arrow keys, Home/End and shift-selection all change the caret without
    // changing the text, and none of them fire 'input'.
    textarea.addEventListener('keyup', redrawCaret);
    textarea.addEventListener('click', redrawCaret);
    textarea.addEventListener('select', redrawCaret);

    // An IME uses Enter to accept the candidate it is showing, so committing
    // the label on that keystroke would end the session in the middle of a word
    // -- and preventing the default would stop the candidate being accepted at
    // all. Taking IME input as it comes is one of the reasons the editor drives
    // an offscreen textarea rather than reading keys itself, so the exception
    // belongs here.
    //
    // keyCode 229 covers browsers that report a composing keystroke that way
    // instead of setting isComposing.
    function isCommitKey(e) {
      if (e.key != 'Enter' || e.shiftKey) return false;
      return !e.isComposing && e.keyCode != 229;
    }

    textarea.addEventListener('keydown', function(e) {
      if (!session) return;
      // The GUI's global key handlers are told to keep out of the way by
      // GUI.getInputElement(), which recognizes a focused textarea; these are
      // the keys the editor itself acts on.
      if (e.key == 'Escape') {
        // Finishes the label and leaves it, the same as clicking away. Escape
        // reads as "I am done here" on a label being typed into, not as "throw
        // away what I typed"; propagation stops so that it does not also turn
        // the tool off.
        e.stopPropagation();
        self.close();
      } else if (isCommitKey(e)) {
        // Enter finishes the label; shift-Enter is how a line gets broken. Most
        // map labels are one line, and Enter is the key that ends entry of a
        // field everywhere else in this app -- the console submits on it. A
        // path label has always ended here, having no room for a second line;
        // now the key does not depend on which kind of label is being typed
        // into, which was a distinction nothing on screen revealed.
        //
        // Shift-Enter needs no handling of its own: the textarea inserts the
        // break itself. On a path label it renders as a space, which is what
        // export does with a break in path text.
        e.preventDefault();
        e.stopPropagation();
        self.close();
      } else {
        e.stopPropagation();
      }
    });

    textarea.addEventListener('blur', function(e) {
      // Clicking elsewhere ends the session, which is what makes one undo step
      // cover one label's text rather than one keystroke.
      //
      // The style panel is the exception: styling a label is part of working on
      // it, not leaving it, and the usual order is to place a label and set its
      // font before typing a word. Its controls that are not form elements do
      // not take focus at all (see the panel's mousedown handler); this covers
      // the font menus and text inputs, which do, and which hand focus back
      // when they are done.
      if (session && !isStylePanelNode(e.relatedTarget)) self.close();
    });
    return textarea;
  }

  function isStylePanelNode(node) {
    return !!(node && node.closest && node.closest('.text-style-panel'));
  }

  function focusTextarea() {
    // Placed near the label so that an IME candidate window appears in a
    // sensible place; it is invisible either way.
    var p;
    if (!session) return; // the panel can ask for focus back after the session
    p = getScreenPosition(session);
    textarea.style.left = Math.round(p.x) + 'px';
    textarea.style.top = Math.round(p.y) + 'px';
    textarea.focus();
  }

  function getScreenPosition(o) {
    var shp = o.pending ? o.pending.coords : o.target.shapes[o.id];
    var p = shp && shp[0] ? ext.translateCoords(shp[0][0], shp[0][1]) : [0, 0];
    return {x: p[0], y: p[1]};
  }

  function redrawCaret() {
    if (session && session.nodes) drawOverlay(session);
  }

  function getCaretStart() {
    return textarea ? textarea.selectionStart : 0;
  }

  function getCaretEnd() {
    return textarea ? textarea.selectionEnd : 0;
  }

  function setCaret(start, end) {
    if (!textarea) return;
    textarea.selectionStart = start;
    textarea.selectionEnd = end;
  }
}
