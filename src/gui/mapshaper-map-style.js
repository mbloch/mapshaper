/* @requires */

var MapStyle = (function() {
  var darkStroke = "#334",
      lightStroke = "#b2d83a",
      pink = "#f74b80",  // dark
      pink2 = "#ffcadd", // medium
      gold = "#efc100",
      gold2 = "#f7ea9f",
      black = "black",
      selectionFill = "rgba(237, 214, 0, 0.12)",
      hoverFill = "rgba(255, 117, 165, 0.2)",
      outlineStyle = {
        type: 'outline',
        strokeColors: [lightStroke, darkStroke],
        strokeWidth: 0.7,
        dotColor: "#223"
      },
      highStyle = {
        dotColor: "#F24400"
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
          strokeWidth: 1.8
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
          strokeWidth: 2.5
        }
      },
      pinnedStyles = {
        polygon: {
          fillColor: pink2,
          strokeColor: pink,
          strokeWidth: 1.8
        }, point:  {
          dotColor: pink,
          dotSize: 8
        }, polyline:  {
          strokeColor: pink,
          strokeWidth: 3
        }
      },
      pinnedSelectionStyles = {
        polygon: {
          fillColor: pink2, // gold2,
          strokeColor: pink, // gold,
          strokeWidth: 1.8
        }, point: {
          dotColor: pink, // gold,
          dotSize: 8
        }, polyline: {
          strokeColor: pink, // gold,
          strokeWidth: 3
        }
      };

  return {
    getHighlightStyle: function() {
      return highStyle;
    },
    getActiveStyle: function(lyr) {
      var style;
      if (MapShaper.layerHasSvgDisplayStyle(lyr)) {
        style = MapShaper.getSvgDisplayStyle(lyr);
      } else {
        style = utils.extend({}, outlineStyle);
      }
      return style;
    },
    getOverlayStyle: getOverlayStyle
  };

  function getOverlayStyle(lyr, o) {
    var type = lyr.geometry_type;
    var topId = o.id;
    var ids = [];
    var styles = [];
    var styler = function(o, i) {
      utils.extend(o, styles[i]);
    };
    var overlayStyle = {
      styler: styler,
      dotSize: 1 // dotSize: kludge to trigger dot renderer
    };
    // first layer: selected feature(s)
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
    // top layer: highlighted feature
    if (topId > -1) {
      var isPinned = o.pinned;
      var inSelection = o.selection_ids.indexOf(topId) > -1;
      var style;
      if (isPinned && inSelection) {
        style = pinnedSelectionStyles[type];
      } else if (isPinned && !inSelection) {
        style = pinnedStyles[type];
      } else if (!isPinned && inSelection) {
        style = selectionHoverStyles[type]; // TODO: differentiate from other hover ids
      } else if (!isPinned && !inSelection) {
        style = hoverStyles[type]; // TODO: differentiate from other hover ids
      }
      ids.push(topId);
      styles.push(style);
    }

    if (MapShaper.layerHasSvgDisplayStyle(lyr) && type == 'point') {
      overlayStyle = MapShaper.wrapHoverStyle(MapShaper.getSvgDisplayStyle(lyr), overlayStyle);
    }
    overlayStyle.ids = ids;
    return ids.length > 0 ? overlayStyle : null;
  }

}());

// Modify style to use scaled circle instead of dot symbol
MapShaper.wrapHoverStyle = function(style, hoverStyle) {
  var styler = function(obj, i) {
    var dotCol;
    style.styler(obj, i);
    if (hoverStyle.styler) {
      hoverStyler.styler(obj, i);
    }
    dotCol = obj.dotColor;
    if (obj.radius && dotColor) {
      obj.radius += 1.5;
      obj.fillColor = dotColor;
      obj.strokeColor = dotColor;
      obj.opacity = 1;
    }
  };
  return {styler: styler};
};

MapShaper.getSvgDisplayStyle = function(lyr) {
  var records = lyr.data.getRecords(),
      fields = MapShaper.getSvgStyleFields(lyr),
      index = MapShaper.svgStyles;
  var styler = function(style, i) {
    var f, key, val;
    for (var j=0; j<fields.length; j++) {
      f = fields[j];
      key = index[f];
      val = records[i][f];
      if (val == 'none') {
        val = 'transparent'; // canvas equivalent
      }
      style[key] = val;
    }

    // TODO: make sure canvas rendering matches svg output
    if (('strokeWidth' in style) && !style.strokeColor) {
      style.strokeColor = 'black';
    } else if (!('strokeWidth' in style) && style.strokeColor) {
      style.strokeWidth = 1;
    }
    if (('radius' in style) && !style.strokeColor && !style.fillColor &&
      lyr.geometry_type == 'point') {
      style.fillColor = 'black';
    }
  };
  return {styler: styler};
};
