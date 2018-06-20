/* @requires */

var MapStyle = (function() {
  var darkStroke = "#334",
      lightStroke = "#b7d9ea",
      violet = "#cc6acc",
      violetFill = "rgba(249, 170, 249, 0.32)",
      gold = "#efc100",
      black = "black",
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
          dotSize: 7
        }, polyline:  {
          strokeColor: violet,
          strokeWidth: 3
        }
      };

  return {
    getIntersectionStyle: function(lyr) {
      return utils.extend({}, intersectionStyle);
    },
    getReferenceStyle: function(lyr) {
      var style;
      if (internal.layerHasCanvasDisplayStyle(lyr)) {
        style = internal.getCanvasDisplayStyle(lyr);
      } else if (internal.layerHasLabels(lyr)) {
        style = {dotSize: 0}; // no reference dots if labels are visible
      } else {
        style = utils.extend({}, referenceStyle);
      }
      return style;
    },
    getActiveStyle: function(lyr) {
      var style;
      if (internal.layerHasCanvasDisplayStyle(lyr)) {
        style = internal.getCanvasDisplayStyle(lyr);
      } else if (internal.layerHasLabels(lyr)) {
        style = utils.extend({}, activeStyleForLabels);
      } else {
        style = utils.extend({}, activeStyle);
      }
      return style;
    },
    getOverlayStyle: getOverlayStyle
  };


  // Returns a display style for the overlay layer. This style displays any
  // hover or selection affects for the active data layer.
  function getOverlayStyle(lyr, o) {
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
    // first layer: features that were selected via the -inspect command
    o.selection_ids.forEach(function(i) {
      // skip features in a higher layer
      if (i == topId || o.hover_ids.indexOf(i) > -1) return;
      ids.push(i);
      styles.push(selectionStyles[type]);
    });
    // second layer: hover feature(s)
    o.hover_ids.forEach(function(i) {
      var style;
      if (i == topId) return;
      style = o.selection_ids.indexOf(i) > -1 ? selectionHoverStyles[type] : hoverStyles[type];
      ids.push(i);
      styles.push(style);
    });
    // top layer: feature that was selected by clicking in inspection mode ([i])
    if (topId > -1) {
      var isPinned = o.pinned;
      var inSelection = o.selection_ids.indexOf(topId) > -1;
      var style;
      if (isPinned) {
        style = pinnedStyles[type];
      } else if (inSelection) {
        style = selectionHoverStyles[type]; // TODO: differentiate from other hover ids
      } else {
        style = hoverStyles[type]; // TODO: differentiate from other hover ids
      }
      ids.push(topId);
      styles.push(style);
    }

    if (internal.layerHasCanvasDisplayStyle(lyr)) {
      if (type == 'point') {
        overlayStyle = internal.wrapOverlayStyle(internal.getCanvasDisplayStyle(lyr), overlayStyle);
      }
      overlayStyle.type = 'styled';
    }
    overlayStyle.ids = ids;
    overlayStyle.overlay = true;
    return ids.length > 0 ? overlayStyle : null;
  }
}());

// Modify style to use scaled circle instead of dot symbol
internal.wrapOverlayStyle = function(style, hoverStyle) {
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
};

internal.getCanvasDisplayStyle = function(lyr) {
  var styleIndex = {
        opacity: 'opacity',
        r: 'radius',
        fill: 'fillColor',
        stroke: 'strokeColor',
        'stroke-width': 'strokeWidth',
        'stroke-dasharray': 'lineDash'
      },
      // array of field names of relevant svg display properties
      fields = internal.getCanvasStyleFields(lyr).filter(function(f) {return f in styleIndex;}),
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
};

// check if layer should be displayed with styles
internal.layerHasCanvasDisplayStyle = function(lyr) {
  var fields = internal.getCanvasStyleFields(lyr);
  if (lyr.geometry_type == 'point') {
    return fields.indexOf('r') > -1; // require 'r' field for point symbols
  }
  return utils.difference(fields, ['opacity', 'class']).length > 0;
};

internal.layerHasLabels = function(lyr) {
  var hasLabels = lyr.geometry_type == 'point' && lyr.data && lyr.data.fieldExists('label-text');
  if (hasLabels && internal.findMaxPartCount(lyr.shapes) > 1) {
    console.error('Multi-point labels are not fully supported');
  }
  return hasLabels;
};

internal.getCanvasStyleFields = function(lyr) {
  var fields = lyr.data ? lyr.data.getFields() : [];
  return internal.svg.findPropertiesBySymbolGeom(fields, lyr.geometry_type);
};
