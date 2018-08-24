/* @require svg-common */

SVG.symbolRenderers.circle = function(d, x, y) {
  var o = SVG.importPoint([x, y], d, {});
  SVG.applyStyleAttributes(o, 'Point', d);
  return [o];
};

SVG.symbolRenderers.label = function(d, x, y) {
  var o = SVG.importLabel(d, [x, y]);
  return [o];
};

SVG.symbolRenderers.image = function(d, x, y) {
  var w = d.width || 20,
      h = d.height || 20;
  var o = {
    tag: 'image',
    properties: {
      width: w,
      height: h,
      x: x - w / 2,
      y: y - h / 2,
      href: d.href || ''
    }
  };
  return [o];
};

SVG.symbolRenderers.square = function(d, x, y) {
  var o = SVG.importPoint([x, y], d, {point_symbol: 'square'});
  SVG.applyStyleAttributes(o, 'Point', d);
  return [o];
};

SVG.symbolRenderers.line = function(d, x, y) {
  var coords, o;
  coords = [[x, y], [x + (d.dx || 0), y + (d.dy || 0)]];
  o = SVG.importLineString(coords);
  SVG.applyStyleAttributes(o, 'LineString', d);
  return [o];
};

SVG.symbolRenderers.group = function(d, x, y) {
  return (d.parts || []).reduce(function(memo, o) {
    var sym = SVG.renderSymbol(o, x, y);
    if (d.chained) {
      x += (o.dx || 0);
      y += (o.dy || 0);
    }
    return memo.concat(sym);
  }, []);
};

SVG.getEmptySymbol = function() {
  return {tag: 'g', properties: {}, children: []};
};

SVG.renderSymbol = function(d, x, y) {
  var renderer = SVG.symbolRenderers[d.type];
   if (!renderer) {
    stop(d.type ? 'Unknown symbol type: ' + d.type : 'Symbol is missing a type property');
  }
  return renderer(d, x || 0, y || 0);
};

// d: svg-symbol object from feature data object
SVG.importSymbol = function(d, xy) {
  var renderer;
  if (!d) {
    return SVG.getEmptySymbol();
  }
  if (utils.isString(d)) {
    d = JSON.parse(d);
  }
  return {
    tag: 'g',
    properties: {
      'class': 'mapshaper-svg-symbol',
      transform: xy ? SVG.getTransform(xy) : null
    },
    children: SVG.renderSymbol(d)
  };
};
