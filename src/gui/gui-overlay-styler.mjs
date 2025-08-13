import { filterLayerByIds } from './gui-layer-utils';
import { utils } from './gui-core';

var selectionFill = "rgba(237, 214, 0, 0.12)",
    // hoverFill = "rgba(255, 120, 255, 0.12)",
    hoverFill = "rgba(0, 0, 0, 0.08)",
    grey = "#888",
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
  var layers, lyr, outlineStyle, ids;
  if (styleOpts.interactionMode == 'vertices') {
    // special overlay: vertex editing mode
    lyr = getOverlayLayer(activeLyr, hitData.ids);
    lyr.gui.style = getVertexStyle(hitData);
    return [lyr];
  }
  if (styleOpts.interactionMode == 'edit_lines' ||
    styleOpts.interactionMode == 'edit_polygons' ||
    styleOpts.interactionMode == 'snip_lines') {
    // special overlay: shape editing mode
    lyr = getOverlayLayer(activeLyr, hitData.ids);
    lyr.gui.style = getLineEditingStyle(hitData);
    return [lyr];
  }
  layers = [];
  // layer containing selected features, not including hover or pinned feature
  ids = utils.difference(hitData.ids || [], [hitData.id]);
  if (ids.length > 0) {
    lyr = getOverlayLayer(activeLyr, ids);
    outlineStyle = selectionStyles[displayLyr.geometry_type];
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
    baseStyler(style, idx);
    if (geomType == 'point') {
      if (style.radius > 0) {
        style.radius += 0.8;
        if (style.strokeWidth > 0) {
          style.strokeColor = outlineStyle.dotColor;
        }
      }
      style.fillColor = outlineStyle.dotColor;
    } else {
      style.strokeColor = outlineStyle.strokeColor;
      style.fillColor = outlineStyle.fillColor;
      style.strokeWidth = Math.max(outlineStyle.strokeWidth, style.strokeWidth || 0);
    }
    style.opacity = 1;
    style.fillOpacity = 1;
    style.strokeOpacity = 1;
  };
  var style = Object.assign({}, baseStyle, {ids, overlay: true, type: 'styled', styler});
  if (baseStyle.dotSize > 0) {
    // dot size must be a static property (not applied by styler function)
    style.dotSize = outlineStyle.dotSize;
  }
  return style;
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

// style for vertex edit mode
function getLineEditingStyle(o) {
  return {
    ids: o.ids,
    overlay: true,
    strokeColor: black,
    strokeWidth: 1.2,
    vertices: true,
    vertex_overlay_color: o.hit_type == 'vertex' ? violet : black,
    vertex_overlay_scale: o.hit_type == 'vertex' ? 2.5 : 2,
    vertex_overlay: o.hit_coordinates || null,
    selected_points: o.selected_points || null,
    fillColor: null
  };
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
