/* @requires */

var MapStyle = (function() {
  var darkStroke = "#334",
      lightStroke = "#b2d83a",
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
          fillColor: "rgba(255, 117, 165, 0.2)", // "#ffebf1",
          strokeColor: "black",
          strokeWidth: 1.2
        }, point:  {
          dotColor: "black",
          dotSize: 8
        }, polyline:  {
          strokeColor: "black",
          strokeWidth: 2.5
        }
      },
      selectionStyles = {
        polygon: {
          fillColor: "#FFFEEB",
          strokeColor: "#EAC618",
          strokeWidth: 1.2
        }, point:  {
          dotColor: "#EAC618",
          dotSize: 6
        }, polyline:  {
          strokeColor: "#EAC618",
          strokeWidth: 1.8
        }
      };
      pinnedStyles = {
        polygon: {
          fillColor: "rgba(255, 120, 162, 0.2)",
          strokeColor: "#f74b80",
          strokeWidth: 1.5
        }, point:  {
          dotColor: "#f74b80",
          dotSize: 8
        }, polyline:  {
          strokeColor: "#f74b80",
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
    getHoverStyle: function(lyr, ids, pinned) {
      var type = lyr.geometry_type;
      var hoverStyle = pinned ? pinnedStyles[type] : hoverStyles[type];
      var style;
      if (MapShaper.layerHasSvgDisplayStyle(lyr) && type == 'point') {
        style = MapShaper.wrapHoverStyle(MapShaper.getSvgDisplayStyle(lyr), hoverStyle);
      } else {
        style = utils.extend({}, hoverStyle);
      }
      style.ids = ids;
      return style;
    },
    getSelectionStyle: function(lyr, ids) {
      var type = lyr.geometry_type;
      var selectionStyle = selectionStyles[type];
      var style;
      if (MapShaper.layerHasSvgDisplayStyle(lyr) && type == 'point') {
        style = MapShaper.wrapHoverStyle(MapShaper.getSvgDisplayStyle(lyr), selectionStyles);
      } else {
        style = utils.extend({}, selectionStyle);
      }
      style.ids = ids;
      return style;
    }
  };
}());

MapShaper.wrapHoverStyle = function(style, hoverStyle) {
  var col = hoverStyle.dotColor;
  var styler = function(obj, i) {
    style.styler(obj, i);
    if (obj.radius) {
      obj.radius += 1.5;
      obj.fillColor = col;
      obj.strokeColor = col;
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
