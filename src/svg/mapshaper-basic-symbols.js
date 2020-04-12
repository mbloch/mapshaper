
import { importStyledLabel, importPoint, applyStyleAttributes, importLineString, importMultiLineString, renderSymbol } from '../svg/geojson-to-svg';
import { symbolRenderers } from '../svg/svg-common';

symbolRenderers.circle = function(d, x, y) {
  var o = importPoint([x, y], d, {});
  applyStyleAttributes(o, 'Point', d);
  return [o];
};

symbolRenderers.label = function(d, x, y) {
  var o = importStyledLabel(d, [x, y]);
  return [o];
};

symbolRenderers.image = function(d, x, y) {
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

symbolRenderers.square = function(d, x, y) {
  var o = importPoint([x, y], d, {point_symbol: 'square'});
  applyStyleAttributes(o, 'Point', d);
  return [o];
};

symbolRenderers.line = function(d, x, y) {
  var coords, o;
  coords = [[x, y], [x + (d.dx || 0), y + (d.dy || 0)]];
  o = importLineString(coords);
  applyStyleAttributes(o, 'LineString', d);
  return [o];
};

symbolRenderers.polyline = function(d, x, y) {
  var coords = d.coordinates || [];
  var o = importMultiLineString(coords);
  applyStyleAttributes(o, 'LineString', d);
  return [o];
};

symbolRenderers.group = function(d, x, y) {
  return (d.parts || []).reduce(function(memo, o) {
    var sym = renderSymbol(o, x, y);
    if (d.chained) {
      x += (o.dx || 0);
      y += (o.dy || 0);
    }
    return memo.concat(sym);
  }, []);
};


