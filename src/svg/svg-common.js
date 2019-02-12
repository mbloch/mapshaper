
var SVG = {};

SVG.propertyTypes = {
  class: 'classname',
  opacity: 'number',
  r: 'number',
  dx: 'measure',
  dy: 'measure',
  fill: 'color',
  stroke: 'color',
  'line-height': 'measure',
  'letter-spacing': 'measure',
  'stroke-width': 'number',
  'stroke-dasharray': 'dasharray',
  rotate: 'number'
};

SVG.symbolRenderers = {};
SVG.furnitureRenderers = {};

SVG.supportedProperties = 'class,opacity,stroke,stroke-width,stroke-dasharray,fill,r,dx,dy,font-family,font-size,text-anchor,font-weight,font-style,line-height,letter-spacing,rotate'.split(',');
SVG.commonProperties = 'class,opacity,stroke,stroke-width,stroke-dasharray'.split(',');

SVG.propertiesBySymbolType = {
  polygon: utils.arrayToIndex(SVG.commonProperties.concat('fill')),
  polyline: utils.arrayToIndex(SVG.commonProperties),
  point: utils.arrayToIndex(SVG.commonProperties.concat('fill', 'r', 'rotate')),
  label: utils.arrayToIndex(SVG.commonProperties.concat(
    'fill,r,font-family,font-size,text-anchor,font-weight,font-style,letter-spacing,dominant-baseline'.split(',')))
};

SVG.findPropertiesBySymbolGeom = function(fields, type) {
  var index = SVG.propertiesBySymbolType[type] || {};
  return fields.filter(function(name) {
    return name in index;
  });
};

SVG.getTransform = function(xy, scale) {
  var str = 'translate(' + xy[0] + ' ' + xy[1] + ')';
  if (scale && scale != 1) {
    str += ' scale(' + scale + ')';
  }
  return str;
};
