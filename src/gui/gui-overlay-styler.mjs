import { filterLayerByIds } from './gui-layer-utils';
import { getCanvasDisplayStyle, getActiveLayerStyle } from './gui-layer-styler';
import { utils, internal } from './gui-core';
import { labelCuesApply } from './gui-label-hit-cues';
import { getHighlightWidth } from './gui-highlight-width';
import {
  getLabelPathGuideLayers,
  getPendingLabelPath,
  getKnotHandleLayers,
  wrapGuideLayer
} from './gui-label-path-guide';

var selectionFill = "rgba(237, 214, 0, 0.12)",
    // hoverFill = "rgba(255, 120, 255, 0.12)",
    hoverFill = "rgba(0, 0, 0, 0.08)",
    grey = "#888",
    orange = "#f28100",
    violet = "#cc6acc",
    black = 'black',
    violetFill = "rgba(249, 120, 249, 0.25)",
    drawingExtraWidth = 5,
    pointExtraWidth = 1.6,
    lineExtraWidth = 1,
    polygonExtraWidth = 0.8,
    // Highlight widths are in px, at any scale (see gui-highlight-width.mjs):
    //   minWidth: the narrowest a line or a shape's outline is drawn
    //   extraWidth: how much wider than the feature it is drawn (for a
    //     circle, how much larger its diameter is)
    //   strokeOverlay: a translucent halo around the feature, beneath which
    //     the feature is seen in its own style, rather than an outline over it
    //   dotSize: the size of a point drawn as a square dot, which does not scale
    hoverStyles = {
      polygon: {
        fillColor: hoverFill,
        strokeColor: black,
        minWidth: 1.2,
        extraWidth: polygonExtraWidth
      }, point:  {
        dotColor: black, // violet, // black,
        dotSize: 2.5,
        extraWidth: pointExtraWidth
      }, polyline: {
        strokeColor: black,
        minWidth: 2,
        extraWidth: lineExtraWidth
      }
    },
    unselectedHoverStyles = {
      polygon: {
        fillColor: 'rgba(0,0,0,0)',
        strokeColor: black,
        minWidth: 1.2,
        extraWidth: polygonExtraWidth
      }, point:  {
        dotColor: black, // grey,
        dotSize: 2,
        extraWidth: pointExtraWidth
      }, polyline:  {
        strokeColor: black, // grey,
        minWidth: 2.5,
        extraWidth: lineExtraWidth
      }
    },
    selectionStyles = {
      polygon: {
        fillColor: hoverFill,
        strokeColor: black,
        minWidth: 1.2,
        extraWidth: polygonExtraWidth
      }, point:  {
        dotColor: violet, // black,
        dotSize: 1.5,
        extraWidth: pointExtraWidth
      }, polyline:  {
        strokeColor: violet, //  black,
        minWidth: 2.5,
        extraWidth: lineExtraWidth
      }
    },
    styleSelectionStyles = {
      polygon: {
        fillColor: null,
        strokeColor: 'rgb(255, 198, 0)',
        strokeOpacity: 0.18,
        extraWidth: drawingExtraWidth,
        strokeOverlay: true,
        batchOverlay: true
      }, polyline:  {
        fillColor: null,
        strokeColor: 'rgb(255, 198, 0)',
        strokeOpacity: 0.18,
        extraWidth: drawingExtraWidth,
        strokeOverlay: true,
        batchOverlay: true
      }, point:  {
        fillColor: null,
        strokeColor: 'rgb(255, 198, 0)',
        strokeOpacity: 0.25,
        extraWidth: drawingExtraWidth * 2,
        strokeOverlay: true,
        batchOverlay: true
      }
    },
    // The halo around the shape under the pointer in the style and drawing
    // tools: fainter than the selection's, so that the shape is still seen in
    // its own style, and reaching as far past the shape
    drawingHoverStyles = {
      polygon: {
        fillColor: null,
        strokeColor: black,
        strokeOpacity: 0.1,
        extraWidth: drawingExtraWidth,
        strokeOverlay: true,
        batchOverlay: true
      }, polyline: {
        fillColor: null,
        strokeColor: black,
        strokeOpacity: 0.1,
        extraWidth: drawingExtraWidth,
        strokeOverlay: true,
        batchOverlay: true
      }, point: {
        fillColor: null,
        strokeColor: black,
        strokeOpacity: 0.1,
        extraWidth: drawingExtraWidth * 2,
        strokeOverlay: true,
        batchOverlay: true
      }
    },
    // currently not used -- selection hover is not styled
    selectionHoverStyles = {
      polygon: {
        fillColor: selectionFill,
        strokeColor: black,
        minWidth: 1.2,
        extraWidth: polygonExtraWidth
      }, point:  {
        dotColor: black,
        dotSize: 1.5,
        extraWidth: pointExtraWidth
      }, polyline:  {
        strokeColor: black,
        minWidth: 2,
        extraWidth: lineExtraWidth
      }
    },
    pinnedStyles = {
      polygon: {
        fillColor: violetFill,
        strokeColor: violet,
        minWidth: 1.8,
        extraWidth: polygonExtraWidth + 0.2
      }, point:  {
        dotColor: violet,
        dotSize: 3,
        extraWidth: pointExtraWidth
      }, polyline:  {
        strokeColor: violet,
        minWidth: 2.4,
        extraWidth: lineExtraWidth + 0.2
      }
    };

export function getOverlayLayers(activeLyr, hitData, styleOpts) {
  if (activeLyr?.hidden || !activeLyr?.gui?.style) return [];
  var displayLyr = activeLyr.gui.displayLayer;
  var layers, lyr, outlineStyle, ids, pending;
  if (styleOpts.interactionMode == 'vertices') {
    // special overlay: vertex editing mode
    lyr = getOverlayLayer(activeLyr, hitData.ids);
    lyr.gui.style = getVertexStyle(hitData);
    return [lyr];
  }
  if (styleOpts.interactionMode == 'edit_lines' ||
    styleOpts.interactionMode == 'edit_polygons' ||
    styleOpts.interactionMode == 'curve_lines' ||
    styleOpts.interactionMode == 'line_style' ||
    styleOpts.interactionMode == 'polygon_style') {
    // with or without the Draw or curve tool, the same selection and hover cues
    return getDrawingLayers(activeLyr, hitData);
  }
  if (styleOpts.interactionMode == 'reshape_lines' ||
    styleOpts.interactionMode == 'reshape_polygons' ||
    styleOpts.interactionMode == 'snip_lines') {
    // special overlay: shape editing mode
    return getShapeEditingLayers(activeLyr, hitData);
  }
  layers = [];
  if (styleOpts.interactionMode == 'label') {
    // The label tool draws its own hover and selection cues in SVG, shaped to
    // the label rather than to the point it hangs from (gui-label-selection.mjs).
    // The canvas overlay would otherwise highlight the anchor -- or, on a layer
    // with no labels on it yet, the polygons the tool is only using as a
    // backdrop, which offers a hover effect for something that cannot be hit.
    //
    // The curve being placed is the exception, and is drawn only while the tool
    // is on: a curve is a guide for placing text, not map content.
    //
    // Only that curve is guided. A curve that is already a label draws its own
    // path and knot handles in the selection cue, and drawing both put two
    // rings on every knot -- the guide's showing as a violet fringe around the
    // cue's, the two being almost but not quite the same size. The cue is the
    // one to keep: its knots are the ones that can be grabbed, and it is in the
    // selection's colour rather than the tool's.
    pending = getPendingLabelPath();
    return getLabelPathGuideLayers(activeLyr, pending ? [pending] : []);
  }
  if (styleOpts.interactionMode == 'symbols') {
    // As in the label tool, the overlay shows the curve being drawn, and an
    // SVG layer's cues are drawn in SVG (gui-symbol-selection.mjs). A layer
    // of plain circles is drawn on canvas, so its cues are drawn here: the
    // halos of the line and polygon tools, which SVG symbols are given too.
    pending = getPendingLabelPath();
    layers = getLabelPathGuideLayers(activeLyr, pending ? [pending] : []);
    if (!internal.layerHasSvgSymbols(activeLyr) && !internal.layerHasLabels(activeLyr)) {
      layers = layers.concat(getSymbolHaloLayers(activeLyr, hitData));
    }
    return layers;
  }
  if (styleOpts.interactionMode == 'point_style') {
    ids = hitData.ids || [];
    if (ids.length > 0) {
      lyr = getOverlayLayer(activeLyr, ids);
      outlineStyle = getSelectionStyle(displayLyr.geometry_type, styleOpts);
      lyr.gui.style = getOverlayStyle(activeLyr, ids, outlineStyle);
      layers.push(lyr);
    }
    return layers;
  }
  if (labelCuesApply(styleOpts.interactionMode, activeLyr)) {
    hitData = withoutLabelledFeatures(displayLyr, hitData);
  }
  // layer containing selected features, not including hover or pinned feature
  ids = utils.difference(hitData.ids || [], [hitData.id]);
  if (ids.length > 0) {
    lyr = getOverlayLayer(activeLyr, ids);
    outlineStyle = getSelectionStyle(displayLyr.geometry_type, styleOpts);
    lyr.gui.style = getOverlayStyle(activeLyr, ids, outlineStyle);
    layers.push(lyr);
  }
  // layer containing a single hover or pinned feature
  if (hitData.id > -1) {
    ids = [hitData.id];
    lyr = getOverlayLayer(activeLyr, ids);
    outlineStyle = getSelectedFeatureStyle(displayLyr, hitData, styleOpts);
    lyr.gui.style = getOverlayStyle(activeLyr, ids, outlineStyle);
    layers.push(lyr);
  }
  return layers;
}

// Labels are cued with boxes around their text (gui-label-hit-cues.mjs). A
// feature with no text has nothing to box, so it keeps the canvas marker.
export function withoutLabelledFeatures(lyr, hitData) {
  var records = lyr.data ? lyr.data.getRecords() : [];
  var unlabelled = function(id) {
    return !internal.svg.featureHasLabel(records[id]);
  };
  return Object.assign({}, hitData, {
    ids: (hitData.ids || []).filter(unlabelled),
    id: hitData.id > -1 && unlabelled(hitData.id) ? hitData.id : -1
  });
}

function getOverlayLayer(activeLyr, ids) {
  var displayLayer = filterLayerByIds(activeLyr.gui.displayLayer, ids);
  var gui = Object.assign({}, activeLyr.gui, {style: null, displayLayer});
  return Object.assign({}, activeLyr, {gui});
}

// The highlight is sized by the canvas, in px at the scale the feature is
// drawn (see getHighlightWidth()), from style.featureWidth: the feature's own
// stroke width, or for a point, the width of the stroke around its circle.
// style.strokeWidth is the highlight's width at 100%, which says there is a
// stroke to draw.
function getOverlayStyle(baseLyr, ids, outlineStyle) {
  var geomType = baseLyr.gui.displayLayer.geometry_type;
  var baseStyle = baseLyr.gui.style;
  var baseStyler = baseStyle.styler || null;
  var highlight = {
    minWidth: outlineStyle.minWidth || 0,
    extraWidth: outlineStyle.extraWidth || 0,
    halo: !!outlineStyle.strokeOverlay
  };
  var styler = function(style, i) {
    // The style object is reused from one shape to the next, and a base
    // styler leaves a stroke width that the layer sets for all its shapes as
    // it finds it, so the previous shape's highlight width is undone first.
    if ('featureWidth' in style) style.strokeWidth = style.featureWidth;
    if (!baseStyler) {
      // e.g. polygons in 'outline' mode, whose lines are not scaled
      Object.assign(style, outlineStyle);
      style.featureWidth = 0;
      style.strokeWidth = getHighlightWidth(0, highlight);
      return;
    }
    baseStyler(style, ids[i]);
    style.featureWidth = style.strokeWidth > 0 ? style.strokeWidth : 0;
    if (geomType == 'point') {
      if (highlight.halo) {
        style.fillColor = null;
        style.strokeColor = outlineStyle.strokeColor;
        style.strokeWidth = highlight.extraWidth;
      } else {
        if (style.strokeWidth > 0) {
          style.strokeColor = outlineStyle.dotColor;
        }
        style.fillColor = outlineStyle.dotColor;
      }
    } else {
      style.strokeColor = outlineStyle.strokeColor;
      style.fillColor = outlineStyle.fillColor;
      style.strokeWidth = getHighlightWidth(style.featureWidth, highlight);
    }
    style.opacity = 1;
    style.fillOpacity = 1;
    style.strokeOpacity = outlineStyle.strokeOpacity >= 0 ? outlineStyle.strokeOpacity : 1;
  };
  var style = Object.assign({}, baseStyle, {ids, overlay: true, type: 'styled', styler, highlight});
  if (outlineStyle.batchOverlay) {
    style.batchOverlay = true;
  }
  if (baseStyle.dotSize > 0 && outlineStyle.dotSize > 0) {
    // dot size must be a static property (not applied by styler function)
    style.dotSize = outlineStyle.dotSize;
  }
  return style;
}

function getSelectionStyle(geomType, styleOpts) {
  if (styleOpts.interactionMode == 'line_style' || styleOpts.interactionMode == 'polygon_style' ||
    styleOpts.interactionMode == 'point_style') {
    return styleSelectionStyles[geomType] || selectionStyles[geomType];
  }
  return selectionStyles[geomType];
}

// style for vertex edit mode
function getVertexStyle(o) {
  return {
    ids: o.ids,
    overlay: true,
    strokeColor: black,
    strokeWidth: 1.5,
    vertices: true,
    vertex_overlay: o.hit_coordinates || null,
    selected_points: o.selected_points || null,
    fillColor: null
  };
}

// The path being drawn is not part of the layer (see gui-draw-lines2.mjs), so
// it is shown as a layer of its own, without vertices, which are only of use
// for reshaping a completed path. The hover markers go on the last layer, so
// they are drawn on top.
//
// While the reshape tool drags a vertex, the shapes it moves are left out of
// the layer (hitData.hidden_ids): their original geometry is drawn as a plain
// outline, and the shapes as they are being reshaped in their own style, with
// only the vertex markers over them.
function getShapeEditingLayers(activeLyr, hitData) {
  var ids = hitData.ids || [];
  var redrawn = getRedrawnShapeIds(activeLyr, hitData);
  var layers = [];
  var editingLyr;
  if (redrawn.length > 0) {
    layers.push(getHiddenShapeLayer(activeLyr, hitData, redrawn));
    layers.push(getRedrawnShapeLayer(activeLyr, redrawn));
  }
  if (hitData.pending_path) {
    layers.push(getPendingPathLayer(activeLyr, hitData));
  }
  if (ids.length > 0 || layers.length === 0 || redrawn.length > 0) {
    editingLyr = getShapeEditingLayer(activeLyr, hitData, ids, true);
    if (redrawn.length > 0) {
      editingLyr.gui.style.verticesOnly = true;
    }
    layers.push(editingLyr);
  }
  layers.forEach(function(lyr, i) {
    if (i < layers.length - 1) {
      lyr.gui.style.vertex_overlay = null;
      lyr.gui.style.pending_snip = null;
    }
  });
  return layers;
}

// The overlay of the line and polygon style modes and their Draw tool: the
// selected shapes; the shape under the pointer, which a click would select;
// the path being drawn; and, on top, the vertex a path would start from or
// snap to, or the curve tool's knot handles. A shape is not highlighted while
// a path is being drawn, since a click then adds a vertex.
//
// A shape that a tool is redrawing as the pending path (hitData.hidden_ids,
// e.g. a curve whose knot is being dragged) is left out of the layer, and is
// drawn here as a plain outline, so that its stroke width, dashes and
// highlight are not seen twice.
function getDrawingLayers(activeLyr, hitData) {
  var geomType = activeLyr.gui.displayLayer.geometry_type;
  var hidden = hitData.hidden_ids || [];
  var selected = (hitData.ids || []).filter(function(id) { return !hidden.includes(id); });
  var redrawn = getRedrawnShapeIds(activeLyr, hitData);
  var layers = [];
  var lyr;
  if (redrawn.length > 0) {
    layers.push(getHiddenShapeLayer(activeLyr, hitData, redrawn));
  }
  if (selected.length > 0) {
    lyr = getOverlayLayer(activeLyr, selected);
    lyr.gui.style = getOverlayStyle(activeLyr, selected,
      styleSelectionStyles[geomType] || selectionStyles[geomType]);
    layers.push(lyr);
  }
  if (hitData.id > -1 && !hitData.pending_path && !hitData.hit_coordinates &&
      !selected.includes(hitData.id)) {
    lyr = getOverlayLayer(activeLyr, [hitData.id]);
    lyr.gui.style = getOverlayStyle(activeLyr, [hitData.id], drawingHoverStyles[geomType]);
    layers.push(lyr);
  }
  if (hitData.pending_path) {
    layers.push(getPendingPathLayer(activeLyr, hitData));
  }
  if (hitData.hit_coordinates) {
    // carries the vertex marker, which is drawn with the layer
    layers.push(getShapeEditingLayer(activeLyr, hitData, [], false));
  }
  layers.forEach(function(lyr, i) {
    if (i < layers.length - 1) lyr.gui.style.vertex_overlay = null;
  });
  return layers.concat(getKnotHandleLayers(activeLyr, hitData.pending_knots,
    hitData.pending_knots ? getKnotLineWidth(activeLyr, hitData) : 0));
}

// The stroke width of the curve whose knots are shown: the path being drawn
// or dragged, or else the selected line. A line in a layer with no style has
// no width of its own, and is not scaled in a preview.
function getKnotLineWidth(activeLyr, hitData) {
  var pathStyle = hitData.pending_path_style;
  var baseStyle = activeLyr.gui.style;
  var ids = hitData.ids || [];
  var style;
  if (hitData.pending_path) {
    return pathStyle ? Number(pathStyle['stroke-width']) || 0 : 0;
  }
  if (ids.length != 1 || !baseStyle.styler) return 0;
  style = Object.assign({}, baseStyle);
  baseStyle.styler(style, ids[0]);
  return style.strokeWidth > 0 ? style.strokeWidth : 0;
}

// The hidden shapes that the overlay draws in place of the layer. A layer
// drawn as an outline draws them plainly already, and is not drawn without
// them (see drawStyledLayerToCanvas()).
function getRedrawnShapeIds(activeLyr, hitData) {
  return hitData.hidden_ids && activeLyr.gui.style.type != 'outline' ?
    hitData.hidden_ids : [];
}

// The shapes' original geometry, as the layer would draw it with no styles
// (see activeStyle in gui-layer-styler.mjs): from hitData.hidden_paths if the
// tool is moving the shapes' vertices, otherwise from the layer.
function getHiddenShapeLayer(activeLyr, hitData, ids) {
  var outline = getActiveLayerStyle(activeLyr.gui.displayLayer, {outlineMode: true});
  var style = {
    overlay: true,
    strokeColor: outline.strokeColors[1],
    strokeWidth: outline.strokeWidth,
    fillColor: null
  };
  var lyr;
  if (hitData.hidden_paths) {
    return getPathsLayer(activeLyr, hitData.hidden_paths, style);
  }
  lyr = getOverlayLayer(activeLyr, ids);
  lyr.gui.style = Object.assign(style, {ids: ids});
  return lyr;
}

function getPathsLayer(activeLyr, paths, style) {
  var nn = [], xx = [], yy = [], shapes = [];
  paths.forEach(function(path, i) {
    shapes.push([[i]]);
    nn.push(path.length);
    path.forEach(function(p) {
      xx.push(p[0]);
      yy.push(p[1]);
    });
  });
  return wrapGuideLayer(activeLyr, {
    name: 'hidden-shapes',
    geometry_type: 'polyline',
    shapes: shapes
  }, style, new internal.ArcCollection(nn, xx, yy));
}

// The shapes in the layer's own style, from the layer's display geometry,
// which the reshape tool is editing
function getRedrawnShapeLayer(activeLyr, ids) {
  var baseStyle = activeLyr.gui.style;
  var baseStyler = baseStyle.styler || null;
  var lyr = getOverlayLayer(activeLyr, ids);
  var style = Object.assign({}, baseStyle, {ids: ids, overlay: true});
  if (baseStyler) {
    style.styler = function(style, i) {
      baseStyler(style, ids[i]);
    };
  }
  lyr.gui.style = style;
  return lyr;
}

function getSymbolHaloLayers(activeLyr, hitData) {
  var selected = hitData.ids || [];
  var layers = [];
  var lyr;
  if (hitData.id > -1 && !selected.includes(hitData.id)) {
    lyr = getOverlayLayer(activeLyr, [hitData.id]);
    lyr.gui.style = getOverlayStyle(activeLyr, [hitData.id], drawingHoverStyles.point);
    layers.push(lyr);
  }
  if (selected.length > 0) {
    lyr = getOverlayLayer(activeLyr, selected);
    lyr.gui.style = getOverlayStyle(activeLyr, selected, styleSelectionStyles.point);
    layers.push(lyr);
  }
  return layers;
}

// The path is drawn in the style the shape will have when it is finished
// (hitData.pending_path_style, from gui-shape-style-state.mjs). A shape with
// no style is drawn as the outline of a layer with no style, which a preview
// does not scale.
function getPendingPathLayer(activeLyr, hitData) {
  var coords = hitData.pending_path;
  var xx = coords.map(function(p) { return p[0]; });
  var yy = coords.map(function(p) { return p[1]; });
  var displayLayer = {
    name: 'pending-path',
    geometry_type: 'polyline',
    shapes: [[[0]]],
    data: new internal.DataTable([Object.assign({}, hitData.pending_path_style)])
  };
  var style = getLineEditingStyle(hitData, [0], false);
  var outline;
  if (hitData.pending_path_style) {
    Object.assign(style, getCanvasDisplayStyle(displayLayer));
  } else {
    outline = getActiveLayerStyle(activeLyr.gui.displayLayer, {outlineMode: true});
    style.strokeColor = outline.strokeColors[1];
    style.strokeWidth = outline.strokeWidth;
  }
  // The end of a path being drawn has closely spaced vertices, and pixel
  // rounding would show as a staircase.
  style.unroundedCoords = true;
  return wrapGuideLayer(activeLyr, displayLayer, style,
    new internal.ArcCollection([coords.length], xx, yy));
}

function getShapeEditingLayer(activeLyr, hitData, ids, showVertices) {
  var lyr = getOverlayLayer(activeLyr, ids);
  lyr.gui.style = getLineEditingStyle(hitData, ids, showVertices);
  if (activeLyr.geometry_type == 'polygon') {
    lyr.gui.style.fillColor = hoverFill;
  }
  return lyr;
}

// style for vertex edit mode
function getLineEditingStyle(o, ids, showVertices) {
  var isVertex = o.hit_type == 'vertex' || o.hit_type == 'disabled';
  return {
    ids: ids,
    overlay: true,
    strokeColor: black,
    strokeWidth: 1.2,
    vertices: showVertices,
    vertex_overlay_color: getVertexOverlayColor(o.hit_type),
    vertex_overlay_scale: isVertex ? 2.5 : 2,
    vertex_overlay: o.hit_coordinates || null,
    pending_snip: o.snip_coordinates || null,
    pending_snip_color: orange,
    selected_points: o.selected_points || null,
    fillColor: null
  };
}

function getVertexOverlayColor(hitType) {
  if (hitType == 'vertex') return violet;
  // a muted dot marks a vertex that the current tool can not act on
  if (hitType == 'disabled') return grey;
  return black;
}

function getSelectedFeatureStyle(lyr, o, opts) {
  var isPinned = o.pinned;
  var inSelection = o.ids.indexOf(o.id) > -1;
  var geomType = lyr.geometry_type;
  var style;
  if (isPinned && opts.interactionMode == 'rectangles') {
    // kludge for rectangle editing mode
    style = selectionStyles[geomType];
  } else if (isPinned) {
    // a feature is pinned
    style = pinnedStyles[geomType];
  } else if (inSelection) {
    // normal hover, or hover id is in the selection set
    style = hoverStyles[geomType];
  } else {
    // features are selected, but hover id is not in the selection set
    style = unselectedHoverStyles[geomType];
  }
  return Object.assign({}, style);
}
