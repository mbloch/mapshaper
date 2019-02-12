
var SVG = {};

SVG.symbolRenderers = {};
SVG.symbolBuilders = {};
SVG.furnitureRenderers = {};


SVG.getTransform = function(xy, scale) {
  var str = 'translate(' + xy[0] + ' ' + xy[1] + ')';
  if (scale && scale != 1) {
    str += ' scale(' + scale + ')';
  }
  return str;
};
