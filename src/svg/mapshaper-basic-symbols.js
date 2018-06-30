/* @require svg-common */

SVG.symbolRenderers.circle = function(d) {
  var o = SVG.importPoint([0, 0], d, {});
  SVG.applyStyleAttributes(o, 'Point', d);
  return [o];
};

SVG.symbolRenderers.label = function(d) {
  var o = SVG.importLabel([0, 0], d);
  SVG.applyStyleAttributes(o, 'Point', d);
  return [o];
};

SVG.symbolRenderers.image = function(d) {
  var w = d.width || 20,
      h = d.height || 20,
      x = -w / 2,
      y = -h / 2;
  var o = {
    tag: 'image',
    properties: {
      width: w,
      height: h,
      x: x,
      y: y,
      href: d.href || ''
    }
  };
  return [o];
};

SVG.symbolRenderers.square = function(d) {
  var o = SVG.importPoint([0, 0], d, {point_symbol: 'square'});
  SVG.applyStyleAttributes(o, 'Point', d);
  return [o];
};

SVG.symbolRenderers.line = function(d) {
  var coords = [[0, 0], [d.dx || 0, d.dy || 0]];
  var o = SVG.importLineString(coords);
  SVG.applyStyleAttributes(o, 'LineString', d);
  return [o];
};

// d: svg-symbol object from feature data object
SVG.importSymbol = function(xy, d) {
  var renderer;
  if (!d) {
    return {tag: 'g', properties: {}, children: []}; // empty symbol
  }
  if (utils.isString(d)) {
    d = JSON.parse(d);
  }
  renderer = SVG.symbolRenderers[d.type];
  if (!renderer) {
    stop(d.type ? 'Unknown symbol type: ' + d.type : 'Symbol is missing a type property');
  }
  return {
    tag: 'g',
    properties: {
      'class': 'mapshaper-svg-symbol',
      transform: SVG.getTransform(xy)
    },
    children: renderer(d)
  };
};
