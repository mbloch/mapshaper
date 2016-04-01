/* @requires
mapshaper-gui-lib
*/

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
          strokeWidth: 3
        }
      },
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
          strokeWidth: 4
        }
      };

  return {
    getHighlightStyle: function() {
      return highStyle;
    },
    getOutlineStyle: function(lyr) {
      return outlineStyle;
    },
    getHoverStyle: function(lyr, ids) {
      return utils.defaults({ids: ids}, hoverStyles[lyr.geometry_type]);
    },
    getSelectionStyle: function(lyr, ids) {
      return utils.defaults({ids: ids}, pinnedStyles[lyr.geometry_type]);
    }
  };
}());
