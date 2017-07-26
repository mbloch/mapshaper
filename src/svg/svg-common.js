
var SVG = {};

SVG.propertyTypes = {
  class: 'classname',
  opacity: 'number',
  r: 'number',
  dx: 'number',
  dy: 'number',
  fill: 'color',
  stroke: 'color',
  'stroke-width': 'number'
};

SVG.canvasEquivalents = {
  'stroke-width': 'strokeWidth'
};

SVG.supportedProperties = 'class,opacity,stroke,stroke-width,fill,r,dx,dy,font-family,font-size,text-anchor'.split(',');
SVG.commonProperties = 'class,opacity,stroke,stroke-width'.split(',');

SVG.propertiesBySymbolType = {
  polygon: SVG.commonProperties.concat('fill'),
  polyline: SVG.commonProperties,
  point: SVG.commonProperties.concat(['fill', 'r']),
  label: SVG.commonProperties.concat(['fill', 'dx', 'dy', 'font-family', 'font-size', 'text-anchor'])
};

SVG.findPropertiesBySymbolType = function(fields, type) {
  var svgNames = SVG.propertiesBySymbolType[type] || [];
  return fields.filter(function(name) {
    return svgNames.indexOf(name) > -1;
  });
};
