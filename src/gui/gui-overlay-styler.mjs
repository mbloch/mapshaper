import { filterLayerByIds } from './gui-layer-utils';
import { getCanvasDisplayStyle } from './gui-layer-styler';
import { utils, internal } from './gui-core';
import { labelCuesApply } from './gui-label-hit-cues';
import {
  getLabelPathGuideLayers,
  getPendingLabelPath,
  wrapGuideLayer
} from './gui-label-path-guide';

var selectionFill = "rgba(237, 214, 0, 0.12)",
    // hoverFill = "rgba(255, 120, 255, 0.12)",
    hoverFill = "rgba(0, 0, 0, 0.08)",
    hoverFillDark = "rgba(255, 255, 255, 0.12)",
    white = 'white',
    grey = "#888",
    orange = "#f28100",
    violet = "#cc6acc",
    black = 'black',
    violetFill = "rgba(249, 120, 249, 0.25)",
    hoverStyles = {
      polygon: {
        fillColor: hoverFill,
        strokeColor: black,
        strokeWidth: 1.2
      }, point:  {
        dotColor: black, // violet, // black,
        dotSize: 2.5
      }, polyline: {
        strokeColor: black,
        strokeWidth: 2,
      }
    },
    unselectedHoverStyles = {
      polygon: {
        fillColor: 'rgba(0,0,0,0)',
        strokeColor: black,
        strokeWidth: 1.2
      }, point:  {
        dotColor: black, // grey,
        dotSize: 2
      }, polyline:  {
        strokeColor: black, // grey,
        strokeWidth: 2.5
      }
    },
    selectionStyles = {
      polygon: {
        fillColor: hoverFill,
        strokeColor: black,
        strokeWidth: 1.2
      }, point:  {
        dotColor: violet, // black,
        dotSize: 1.5
      }, polyline:  {
        strokeColor: violet, //  black,
        strokeWidth: 2.5
      }
    },
    styleSelectionStyles = {
      polygon: {
        fillColor: null,
        strokeColor: 'rgb(255, 198, 0)',
        strokeOpacity: 0.18,
        strokeWidth: 5,
        strokeOverlay: true,
        batchOverlay: true
      }, polyline:  {
        fillColor: null,
        strokeColor: 'rgb(255, 198, 0)',
        strokeOpacity: 0.18,
        strokeWidth: 5,
        strokeOverlay: true,
        batchOverlay: true
      }, point:  {
        fillColor: null,
        strokeColor: 'rgb(255, 198, 0)',
        strokeOpacity: 0.25,
        strokeWidth: 5,
        strokeOverlay: true,
        batchOverlay: true
      }
    },
    // currently not used -- selection hover is not styled
    selectionHoverStyles = {
      polygon: {
        fillColor: selectionFill,
        strokeColor: black,
        strokeWidth: 1.2
      }, point:  {
        dotColor: black,
        dotSize: 1.5
      }, polyline:  {
        strokeColor: black,
        strokeWidth: 2
      }
    },
    pinnedStyles = {
      polygon: {
        fillColor: violetFill,
        strokeColor: violet,
        strokeWidth: 1.8
      }, point:  {
        dotColor: violet,
        dotSize: 3
      }, polyline:  {
        strokeColor: violet,
        strokeWidth: 2.4
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
    styleOpts.interactionMode == 'line_style' ||
    styleOpts.interactionMode == 'polygon_style') {
    // with or without the Draw tool, the same selection and hover cues
    return getDrawingLayers(activeLyr, hitData, styleOpts);
  }
  if (styleOpts.interactionMode == 'reshape_lines' ||
    styleOpts.interactionMode == 'reshape_polygons' ||
    styleOpts.interactionMode == 'snip_lines') {
    // special overlay: shape editing mode
    return getShapeEditingLayers(activeLyr, hitData, styleOpts);
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

function getOverlayStyle(baseLyr, ids, outlineStyle) {
  var geomType = baseLyr.gui.displayLayer.geometry_type;
  var baseStyle = baseLyr.gui.style;
  var baseStyler = baseStyle.styler || null;
  var styler = function(style, i) {
    if (!baseStyler) {
      // e.g. polygons in 'outline' mode
      Object.assign(style, outlineStyle);
      return;
    }
    var idx = ids[i];
    if (outlineStyle.strokeOverlay) {
      delete style.strokeWidth;
      delete style.strokeColor;
    }
    baseStyler(style, idx);
    if (geomType == 'point') {
      if (outlineStyle.strokeOverlay) {
        if (style.radius > 0) {
          style.radius += (style.strokeWidth || 0) / 2 + outlineStyle.strokeWidth / 2;
        }
        style.fillColor = null;
        style.strokeColor = outlineStyle.strokeColor;
        style.strokeWidth = outlineStyle.strokeWidth;
      } else {
        if (style.radius > 0) {
          style.radius += 0.8;
          if (style.strokeWidth > 0) {
            style.strokeColor = outlineStyle.dotColor;
          }
        }
        style.fillColor = outlineStyle.dotColor;
      }
    } else {
      style.strokeColor = outlineStyle.strokeColor;
      style.fillColor = outlineStyle.fillColor;
      style.strokeWidth = outlineStyle.strokeOverlay ?
        (style.strokeWidth || 0) + outlineStyle.strokeWidth :
        Math.max(outlineStyle.strokeWidth, style.strokeWidth || 0);
      // How much of strokeWidth is halo, so that the canvas can size a line's
      // arrowheads by the line's own width (see getArrowLinePencil()). Set
      // for every shape, since the style object is reused.
      style.haloWidth = outlineStyle.strokeOverlay ? outlineStyle.strokeWidth : 0;
    }
    style.opacity = 1;
    style.fillOpacity = 1;
    style.strokeOpacity = outlineStyle.strokeOpacity >= 0 ? outlineStyle.strokeOpacity : 1;
  };
  var style = Object.assign({}, baseStyle, {ids, overlay: true, type: 'styled', styler});
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
function getShapeEditingLayers(activeLyr, hitData, styleOpts) {
  var ids = hitData.ids || [];
  var layers = [];
  var dark = !!(styleOpts && styleOpts.darkMode);
  if (hitData.pending_path) {
    layers.push(getPendingPathLayer(activeLyr, hitData, dark));
  }
  if (ids.length > 0 || layers.length === 0) {
    layers.push(getShapeEditingLayer(activeLyr, hitData, ids, true, dark));
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
// snap to. A shape is not highlighted while a path is being drawn, since a
// click then adds a vertex.
function getDrawingLayers(activeLyr, hitData, styleOpts) {
  var geomType = activeLyr.gui.displayLayer.geometry_type;
  var selected = hitData.ids || [];
  var dark = !!(styleOpts && styleOpts.darkMode);
  var layers = [];
  var lyr;
  if (selected.length > 0) {
    lyr = getOverlayLayer(activeLyr, selected);
    lyr.gui.style = getOverlayStyle(activeLyr, selected,
      styleSelectionStyles[geomType] || selectionStyles[geomType]);
    layers.push(lyr);
  }
  if (hitData.id > -1 && !hitData.pending_path && !hitData.hit_coordinates &&
      !selected.includes(hitData.id)) {
    lyr = getOverlayLayer(activeLyr, [hitData.id]);
    lyr.gui.style = getOverlayStyle(activeLyr, [hitData.id], getDrawingHoverStyle(dark));
    layers.push(lyr);
  }
  if (hitData.pending_path) {
    layers.push(getPendingPathLayer(activeLyr, hitData, dark));
  }
  if (hitData.hit_coordinates) {
    // carries the vertex marker, which is drawn with the layer
    layers.push(getShapeEditingLayer(activeLyr, hitData, [], false, dark));
  }
  layers.forEach(function(lyr, i) {
    if (i < layers.length - 1) lyr.gui.style.vertex_overlay = null;
  });
  return layers;
}

// A halo around the shape under the pointer, fainter than the selection's, so
// that the shape is still seen in its own style
function getDrawingHoverStyle(dark) {
  return {
    fillColor: null,
    strokeColor: dark ? white : black,
    strokeOpacity: dark ? 0.25 : 0.1,
    strokeWidth: 5,
    strokeOverlay: true,
    batchOverlay: true
  };
}

// The path is drawn in the style the shape will have when it is finished
// (hitData.pending_path_style, from gui-shape-style-state.mjs), so that what
// is drawn on a dark basemap can be seen while it is being drawn.
function getPendingPathLayer(activeLyr, hitData, dark) {
  var coords = hitData.pending_path;
  var xx = coords.map(function(p) { return p[0]; });
  var yy = coords.map(function(p) { return p[1]; });
  var displayLayer = {
    name: 'pending-path',
    geometry_type: 'polyline',
    shapes: [[[0]]],
    data: new internal.DataTable([Object.assign({}, hitData.pending_path_style)])
  };
  var style = getLineEditingStyle(hitData, [0], false, dark);
  if (hitData.pending_path_style) {
    Object.assign(style, getCanvasDisplayStyle(displayLayer));
  }
  // The end of a path being drawn has closely spaced vertices, and pixel
  // rounding would show as a staircase.
  style.unroundedCoords = true;
  return wrapGuideLayer(activeLyr, displayLayer, style,
    new internal.ArcCollection([coords.length], xx, yy));
}

function getShapeEditingLayer(activeLyr, hitData, ids, showVertices, dark) {
  var lyr = getOverlayLayer(activeLyr, ids);
  lyr.gui.style = getLineEditingStyle(hitData, ids, showVertices, dark);
  if (activeLyr.geometry_type == 'polygon') {
    lyr.gui.style.fillColor = dark ? hoverFillDark : hoverFill;
  }
  return lyr;
}

// style for vertex edit mode
// dark: the basemap is dark, so the outline and markers are drawn in white
function getLineEditingStyle(o, ids, showVertices, dark) {
  var isVertex = o.hit_type == 'vertex' || o.hit_type == 'disabled';
  return {
    ids: ids,
    overlay: true,
    strokeColor: dark ? white : black,
    strokeWidth: 1.2,
    vertices: showVertices,
    vertex_overlay_color: getVertexOverlayColor(o.hit_type, dark),
    vertex_overlay_scale: isVertex ? 2.5 : 2,
    vertex_overlay: o.hit_coordinates || null,
    pending_snip: o.snip_coordinates || null,
    pending_snip_color: orange,
    selected_points: o.selected_points || null,
    fillColor: null
  };
}

function getVertexOverlayColor(hitType, dark) {
  if (hitType == 'vertex') return violet;
  // a muted dot marks a vertex that the current tool can not act on
  if (hitType == 'disabled') return grey;
  return dark ? white : black;
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
