
var SVG = {};

SVG.propertyTypes = {
  class: 'classname',
  opacity: 'number',
  r: 'number',
  dx: 'measure',
  dy: 'measure',
  fill: 'color',
  stroke: 'color',
  'stroke-width': 'number'
};

SVG.canvasEquivalents = {
  'stroke-width': 'strokeWidth'
};

SVG.supportedProperties = 'class,opacity,stroke,stroke-width,fill,r,dx,dy,font-family,font-size,text-anchor,font-weight,font-style'.split(',');
SVG.commonProperties = 'class,opacity,stroke,stroke-width'.split(',');

SVG.propertiesBySymbolGeom = {
  polygon: SVG.commonProperties.concat(['fill']),
  polyline: SVG.commonProperties,
  point: SVG.commonProperties.concat(['fill']) // 'r' is applied elsewhere (importPoint())
};

SVG.findPropertiesBySymbolGeom = function(fields, type) {
  var svgNames = SVG.propertiesBySymbolGeom[type] || [];
  if (type == 'point' && fields.indexOf('label-text') > -1) { // kludge for label properties
    svgNames.push('font-family', 'font-size', 'text-anchor', 'font-weight', 'font-style');
  }
  return fields.filter(function(name) {
    return svgNames.indexOf(name) > -1;
  });
};
