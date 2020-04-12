import { internal, utils } from './gui-core';

var darkStroke = "#334",
    lightStroke = "#b7d9ea",
    violet = "#cc6acc",
    violetFill = "rgba(249, 170, 249, 0.32)",
    gold = "#efc100",
    black = "black",
    grey = "#888",
    selectionFill = "rgba(237, 214, 0, 0.12)",
    hoverFill = "rgba(255, 180, 255, 0.2)",
    activeStyle = { // outline style for the active layer
      type: 'outline',
      strokeColors: [lightStroke, darkStroke],
      strokeWidth: 0.7,
      dotColor: "#223",
      dotSize: 4
    },
    activeStyleForLabels = {
      dotColor: "rgba(250, 0, 250, 0.45)", // violet dot with transparency
      dotSize: 4
    },
    referenceStyle = { // outline style for reference layers
      type: 'outline',
      strokeColors: [null, '#86c927'],
      strokeWidth: 0.85,
      dotColor: "#73ba20",
      dotSize: 4
    },
    intersectionStyle = {
      dotColor: "#F24400",
      dotSize: 4
    },
    hoverStyles = {
      polygon: {
        fillColor: hoverFill,
        strokeColor: black,
        strokeWidth: 1.2
      }, point:  {
        dotColor: black,
        dotSize: 8
      }, polyline:  {
        strokeColor: black,
        strokeWidth: 2.5
      }
    },
    unfilledHoverStyles = {
      polygon: {
        fillColor: 'rgba(0,0,0,0)',
        strokeColor: black,
        strokeWidth: 1.2
      }, point:  {
        dotColor: grey,
        dotSize: 8
      }, polyline:  {
        strokeColor: grey,
        strokeWidth: 2.5
      }
    },
    selectionStyles = {
      polygon: {
        fillColor: selectionFill,
        strokeColor: gold,
        strokeWidth: 1
      }, point:  {
        dotColor: gold,
        dotSize: 6
      }, polyline:  {
        strokeColor: gold,
        strokeWidth: 1.5
      }
    },
    selectionHoverStyles = {
      polygon: {
        fillColor: selectionFill,
        strokeColor: black,
        strokeWidth: 1.2
      }, point:  {
        dotColor: black,
        dotSize: 6
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
        dotColor: 'violet',
        dotSize: 8
      }, polyline:  {
        strokeColor: violet,
        strokeWidth: 3
      }
    };

export function getIntersectionStyle(lyr) {
  return utils.extend({}, intersectionStyle);
}

export function getReferenceStyle(lyr) {
  var style;
  if (layerHasCanvasDisplayStyle(lyr)) {
    style = getCanvasDisplayStyle(lyr);
  } else if (internal.layerHasLabels(lyr)) {
    style = {dotSize: 0}; // no reference dots if labels are visible
  } else {
    style = utils.extend({}, referenceStyle);
  }
  return style;
}

export function getActiveStyle(lyr) {
  var style;
  if (layerHasCanvasDisplayStyle(lyr)) {
    style = getCanvasDisplayStyle(lyr);
  } else if (internal.layerHasLabels(lyr)) {
    style = utils.extend({}, activeStyleForLabels);
  } else {
    style = utils.extend({}, activeStyle);
  }
  return style;
}


// Returns a display style for the overlay layer. This style displays any
// hover or selection affects for the active data layer.
export function getOverlayStyle(lyr, o) {
  var type = lyr.geometry_type;
  var topId = o.id;
  var ids = [];
  var styles = [];
  var styler = function(o, i) {
    utils.extend(o, styles[i]);
  };
  var overlayStyle = {
    styler: styler
  };

  o.ids.forEach(function(i) {
    var style;
    if (i == topId) return;
    style = hoverStyles[type];
    // style = o.selection_ids.indexOf(i) > -1 ? selectionHoverStyles[type] : hoverStyles[type];
    ids.push(i);
    styles.push(style);
  });
  // top layer: feature that was selected by clicking in inspection mode ([i])
  if (topId > -1) {
    var isPinned = o.pinned;
    var inSelection = o.ids.indexOf(topId) > -1;
    var style;
    if (isPinned) {
      style = pinnedStyles[type];
    } else if (inSelection) {
      style = hoverStyles[type];
    } else {
      style = unfilledHoverStyles[type];
    }
    ids.push(topId);
    styles.push(style);
  }

  if (layerHasCanvasDisplayStyle(lyr)) {
    if (type == 'point') {
      overlayStyle = wrapOverlayStyle(getCanvasDisplayStyle(lyr), overlayStyle);
    }
    overlayStyle.type = 'styled';
  }
  overlayStyle.ids = ids;
  overlayStyle.overlay = true;
  return ids.length > 0 ? overlayStyle : null;
}

// Modify style to use scaled circle instead of dot symbol
function wrapOverlayStyle(style, hoverStyle) {
  var styler = function(obj, i) {
    var dotColor;
    var id = obj.ids ? obj.ids[i] : -1;
    obj.strokeWidth = 0; // kludge to support setting minimum stroke width
    style.styler(obj, id);
    if (hoverStyle.styler) {
      hoverStyle.styler(obj, i);
    }
    dotColor = obj.dotColor;
    if (obj.radius && dotColor) {
      obj.radius += 0.4;
      // delete obj.fillColor; // only show outline
      obj.fillColor = dotColor; // comment out to only highlight stroke
      obj.strokeColor = dotColor;
      obj.strokeWidth = Math.max(obj.strokeWidth + 0.8, 1.5);
      obj.opacity = 1;
    }
  };
  return {styler: styler};
}

function getCanvasDisplayStyle(lyr) {
  var styleIndex = {
        opacity: 'opacity',
        r: 'radius',
        fill: 'fillColor',
        stroke: 'strokeColor',
        'stroke-width': 'strokeWidth',
        'stroke-dasharray': 'lineDash'
      },
      // array of field names of relevant svg display properties
      fields = getCanvasStyleFields(lyr).filter(function(f) {return f in styleIndex;}),
      records = lyr.data.getRecords();
  var styler = function(style, i) {
    var rec = records[i];
    var fname, val;
    for (var j=0; j<fields.length; j++) {
      fname = fields[j];
      val = rec && rec[fname];
      if (val == 'none') {
        val = 'transparent'; // canvas equivalent of CSS 'none'
      }
      // convert svg property name to mapshaper style equivalent
      style[styleIndex[fname]] = val;
    }

    if (style.strokeWidth && !style.strokeColor) {
      style.strokeColor = 'black';
    }
    if (!('strokeWidth' in style) && style.strokeColor) {
      style.strokeWidth = 1;
    }
    if (style.radius > 0 && !style.strokeWidth && !style.fillColor && lyr.geometry_type == 'point') {
      style.fillColor = 'black';
    }
  };
  return {styler: styler, type: 'styled'};
}

// check if layer should be displayed with styles
function layerHasCanvasDisplayStyle(lyr) {
  var fields = getCanvasStyleFields(lyr);
  if (lyr.geometry_type == 'point') {
    return fields.indexOf('r') > -1; // require 'r' field for point symbols
  }
  return utils.difference(fields, ['opacity', 'class']).length > 0;
}


function getCanvasStyleFields(lyr) {
  var fields = lyr.data ? lyr.data.getFields() : [];
  return internal.findPropertiesBySymbolGeom(fields, lyr.geometry_type);
}
