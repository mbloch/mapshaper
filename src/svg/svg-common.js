
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
  'stroke-width': 'number'
};

SVG.canvasEquivalents = {
  'stroke-width': 'strokeWidth'
};

SVG.supportedProperties = 'class,opacity,stroke,stroke-width,fill,r,dx,dy,font-family,font-size,text-anchor,font-weight,font-style,line-height,letter-spacing'.split(',');
SVG.commonProperties = 'class,opacity,stroke,stroke-width'.split(',');

SVG.propertiesBySymbolType = {
  polygon: utils.arrayToIndex(SVG.commonProperties.concat('fill')),
  polyline: utils.arrayToIndex(SVG.commonProperties),
  point: utils.arrayToIndex(SVG.commonProperties.concat('fill', 'r')),
  label: utils.arrayToIndex(SVG.commonProperties.concat(
    'fill,r,font-family,font-size,text-anchor,font-weight,font-style,letter-spacing'.split(',')))
};

SVG.findPropertiesBySymbolGeom = function(fields, type) {
  var index = SVG.propertiesBySymbolType[type] || {};
  return fields.filter(function(name) {
    return name in index;
  });
};
