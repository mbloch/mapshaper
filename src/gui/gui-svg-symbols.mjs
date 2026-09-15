import { internal, utils } from './gui-core';
import { TEXT_PLACEHOLDER } from './gui-label-text';

// Attribute identifying a label baseline inside a layer's <defs>, and the
// feature it belongs to. Deliberately not data-id: the label tool looks symbols
// up with querySelector('[data-id="N"]') and no tag filter, so a <defs> path
// carrying data-id would shadow the <text> it belongs to.
var LABEL_PATH_ATTR = 'data-label-path';
var LABEL_PATH_SELECTOR = 'path[' + LABEL_PATH_ATTR + ']';
var LABEL_PATH_SCALE_ATTR = 'data-label-path-scale';

export function getSymbolNodeId(node) {
  return parseInt(node.getAttribute('data-id'));
}

export function getSvgSymbolTransform(xy, ext) {
  var scale = ext.getSymbolScale();
  var p = ext.translateCoords(xy[0], xy[1]);
  return internal.svg.getTransform(p, scale);
}

export function repositionSymbols(elements, layer, ext) {
  var el, idx, shp, p, displayOn, inView;
  // OPTIMIZATION: only display symbols that are in view
  // quick-and-dirty hit-test: expand the extent rectangle by a percentage.
  //   very large symbols will disappear before they're completely out of view
  var displayBounds = ext.getBounds(1.15);
  var records = layer.data ? layer.data.getRecords() : null;
  for (var i=0, n=elements.length; i<n; i++) {
    el = elements[i];
    idx = getSymbolNodeId(el);
    shp = layer.shapes[idx];
    if (!shp) continue;
    p = shp[0];
    displayOn = !el.hasAttribute('display') || el.getAttribute('display') == 'block';
    // A path label occupies its whole curve rather than a point, so testing
    // only the anchor knot would hide a label that is still mostly on screen --
    // or all of one that spans the viewport.
    inView = records && internal.svg.shapeIsPathLabel(shp, records[idx]) ?
      shapeBoundsInView(shp, displayBounds) :
      displayBounds.containsPoint(p[0], p[1]);
    if (inView) {
      if (!displayOn) el.setAttribute('display', 'block');
      el.setAttribute('transform', getSvgSymbolTransform(p, ext));
    } else {
      if (displayOn) el.setAttribute('display', 'none');
    }
  }
}

// Bounding-box overlap test, written out rather than built as a Bounds so that
// repositioning stays allocation-free.
function shapeBoundsInView(shp, bounds) {
  var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  var p, i;
  for (i = 0; i < shp.length; i++) {
    p = shp[i];
    if (p[0] < xmin) xmin = p[0];
    if (p[0] > xmax) xmax = p[0];
    if (p[1] < ymin) ymin = p[1];
    if (p[1] > ymax) ymax = p[1];
  }
  return xmin <= bounds.xmax && xmax >= bounds.xmin &&
    ymin <= bounds.ymax && ymax >= bounds.ymin;
}

export function renderSymbols(lyr, ext, idPrefix) {
  var records = lyr.data.getRecords();
  var view = getLabelPathView(ext);
  var defs = [];
  var symbols = lyr.shapes.map(function(shp, i) {
    var d = records[i];
    var obj = shp && d ? renderSymbol(d, shp, view, defs, idPrefix, i) : null;
    if (!obj) return null;
    obj.properties.class = addClass(obj.properties.class, 'mapshaper-svg-symbol');
    obj.properties.transform = getSvgSymbolTransform(shp[0], ext);
    obj.properties['data-id'] = i;
    return obj;
  }).filter(Boolean);
  var obj = internal.getEmptyLayerForSVG(lyr, {});
  // <defs> has to come first so the layer's own markup can reference it
  obj.children = defs.length > 0 ?
    [{tag: 'defs', children: defs}].concat(symbols) : symbols;
  return internal.svg.stringify(obj);
}

// Markup for a label that is not in any layer yet: the one being typed into
// before it has been created.
//
// Rendered by the same path the layer's own symbols take, which is the whole
// point. A pending label is then laid out, positioned and styled exactly as the
// committed one will be, so the editor can treat it as an ordinary label: the
// caret, the box, the ghosted curve and the em-based label positions are all
// read back off the rendered text, and none of them have to be recomputed for a
// label that does not exist. Getting `dy: '0.7em'` right by hand would mean
// resolving em units against the font this label happens to use.
//
// Deliberately carries neither data-id nor the mapshaper-svg-symbol class. The
// hit test, the reposition pass and the selection cue all find labels by those,
// and a node with no feature behind it must not be found by any of them.
//
// @rec: the label's record, as -add-label will write it
// @shp: its knots, in the layer's display coordinates
// Returns a markup string, or '' if there is nothing to draw.
export function renderPendingSymbol(rec, shp, ext, idPrefix) {
  var defs = [];
  var obj = shp && shp[0] ?
    renderSymbol(rec, shp, getLabelPathView(ext), defs, idPrefix, 0) : null;
  if (!obj) return '';
  obj.properties.class = addClass(obj.properties.class, 'mapshaper-pending-symbol');
  obj.properties.transform = getSvgSymbolTransform(shp[0], ext);
  return internal.svg.stringify({
    tag: 'g',
    // The label's own container is what carries the text defaults a committed
    // label inherits from its layer's group. Without them the browser's own
    // defaults apply, and the label was left-aligned at the wrong size until
    // the moment it was created.
    properties: internal.getLabelTextDefaults(),
    children: defs.length > 0 ? [{tag: 'defs', children: defs}, obj] : [obj]
  });
}

function renderSymbol(d, shp, view, defs, idPrefix, i) {
  var obj, pathId;
  var rec = withPlaceholderText(d);
  if (!internal.svg.shapeIsPathLabel(shp, rec)) {
    return internal.svg.renderPoint(rec);
  }
  // The editor keeps a label that doesn't fit its path visible and marked,
  // where export drops it: hiding a broken label makes it unfindable, and so
  // unfixable.
  obj = internal.svg.renderPathLabel(rec, getLabelPathCoords(shp, view),
    {keepOverflow: true});
  if (!obj) return null;
  // One definition per feature rather than one per distinct path, so that
  // updateLabelPaths() can find a label's baseline. Sharing definitions between
  // identical paths saves bytes in an exported file, which is not a concern
  // here, and would cost the ability to update one label's geometry.
  pathId = idPrefix + '-lp-' + i;
  defs.push(getLabelPathDefinition(pathId, i,
    internal.svg.referenceLabelPath(obj, pathId)));
  return obj;
}

function getLabelPathDefinition(pathId, featureId, d) {
  var properties = {id: pathId, d: d};
  properties[LABEL_PATH_ATTR] = featureId;
  return {tag: 'path', properties: properties};
}

// A label path is drawn in the coordinate space inside its symbol group, so
// that a frame's zoom is absorbed by the group transform rather than rebuilt
// into the path. internal.svg.getLabelPathCoords() does the mapping and
// explains why; the view object just caches the two inputs for a whole layer,
// since ext.getTransform() rebuilds a Bounds on every call.
function getLabelPathView(ext) {
  return {
    transform: ext.getTransform(),
    symbolScale: ext.getSymbolScale()
  };
}

function getLabelPathCoords(shp, view) {
  return internal.svg.getLabelPathCoords(shp, view.transform, view.symbolScale);
}

// Scale from CRS units to the space a label path is drawn in. Unaffected by
// panning, and by zooming too when a frame is defined.
function getLabelPathScale(ext) {
  return ext.getTransform().mx / ext.getSymbolScale();
}

// Records the scale a layer's baselines were built at, so that the first
// reposition after a draw doesn't rebuild them needlessly.
export function markLabelPathScale(node, ext) {
  node.setAttribute(LABEL_PATH_SCALE_ATTR, String(getLabelPathScale(ext)));
}

// Rebuilds label baselines after the map has moved, but only when the scale
// they were built at no longer applies -- so never on a pan, and never on a
// zoom of a framed layer. Called from the reposition path, because navigating
// the map does not redraw SVG layers.
export function updateLabelPaths(container, layer, ext) {
  var paths = container.querySelectorAll(LABEL_PATH_SELECTOR);
  var records, scale, view;
  if (paths.length === 0) return;
  scale = getLabelPathScale(ext);
  if (container.getAttribute(LABEL_PATH_SCALE_ATTR) == String(scale)) return;
  container.setAttribute(LABEL_PATH_SCALE_ATTR, String(scale));
  records = layer.data ? layer.data.getRecords() : null;
  view = getLabelPathView(ext);
  for (var i = 0; i < paths.length; i++) {
    updateLabelPath(paths[i], layer, records, view);
  }
}

function updateLabelPath(path, layer, records, view) {
  var id = parseInt(path.getAttribute(LABEL_PATH_ATTR));
  var shp = layer.shapes[id];
  var rec = records && records[id];
  var d;
  if (!shp || !rec) return;
  d = internal.svg.getLabelPathData(getLabelPathCoords(shp, view));
  if (d) path.setAttribute('d', d);
}

// Gives a label with no text yet a zero-width space to lay out.
//
// Without it the label renders nothing -- not an empty element, no element at
// all, because renderPoint() returns null for a feature with no label text. A
// label the user has just created would then be invisible and unclickable, with
// no node to hold a caret and no way back into it. The placeholder puts no mark
// on the map. Export drops empty labels rather than doing this.
function withPlaceholderText(d) {
  if (!internal.svg.featureIsLabel(d) || internal.svg.featureHasLabel(d)) return d;
  return utils.defaults({'label-text': TEXT_PLACEHOLDER}, d);
}

function addClass(existing, name) {
  return existing ? existing + ' ' + name : name;
}
