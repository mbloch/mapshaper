// convert data records (properties like svg-symbol, label-text, fill, r) to svg symbols
//
import { importLineString, importMultiLineString, importPolygon } from '../svg/svg-geom-primitives';
import { featureHasSvgSymbol, featureHasLabel } from '../svg/svg-feature-utils';
import { renderStyledLabel } from './svg-labels';
import utils from '../utils/mapshaper-utils';
import { applyStyleAttributes } from '../svg/svg-properties';
import { message } from '../utils/mapshaper-logging';
import { roundToTenths } from '../geom/mapshaper-rounding';

export function getTransform(xy, scale) {
  var str = 'translate(' + roundToTenths(xy[0]) + ' ' + roundToTenths(xy[1]) + ')';
  if (scale && scale != 1) {
    str += ' scale(' + scale + ')';
  }
  return str;
}

export var symbolRenderers = {
  line: line,
  polygon: polygon,
  polyline: polyline,
  circle: circle,
  square: square,
  image: image,
  group: group,
  label: label,
  offset: offset
};

// render label and/or point symbol
export function renderPoint(rec) {
  var children = [];
  // var halfSize = rec.r || 0; // radius or half of symbol size
  if (featureHasSvgSymbol(rec)) {
    children.push(renderSymbol(rec));
  }
  if (featureHasLabel(rec)) {
    children.push(renderStyledLabel(rec));
  }
  var o = children.length > 1 ? {tag: 'g', children: children} : children[0];
  if (!o) return null;
  o.properties = o.properties || {};
  return o;
}

function renderSymbol(d) {
  if (d['svg-symbol']) {
    return renderComplexSymbol(d['svg-symbol']);
  }
  if (featureHasIcon(d)) {
    return renderIcon(d);
  }
  if (d.r > 0) {
    return circle(d);
  }
  return empty();
}

function featureHasIcon(d) {
  return !!(d && (d.icon || d['icon-size'] || (d['icon-color'] && d.r > 0)));
}

function renderIcon(d) {
  var type = d.icon || 'circle';
  var r = getIconRadius(d, type);
  if (r > 0 === false) return empty();
  if (type == 'circle') return circle(getIconStyleData(d, r));
  if (type == 'square') return square(getIconStyleData(d, r), 0, 0);
  if (type == 'ring') return ring(getIconStyleData(d, r), 0, 0);
  if (type == 'star') return star(getIconStyleData(d, r));
  message('Unknown icon type: ' + type);
  return empty();
}

function getIconRadius(d, type) {
  var size;
  if (d['icon-size'] > 0 === false) {
    return d.r > 0 ? d.r : 5;
  }
  size = d['icon-size'];
  if (type == 'circle' || type == 'ring') {
    size -= 1;
  } else if (type == 'star') {
    size += 1;
  }
  return size / 2;
}

function getIconStyleData(d, r) {
  var o = utils.extend({}, d);
  o.r = r;
  o.fill = d['icon-color'] || d.fill || 'black';
  return o;
}

function renderComplexSymbol(sym, x, y) {
  if (utils.isString(sym)) {
    sym = JSON.parse(sym);
  }
  if (sym.tag) {
    // symbol appears to already use mapshaper's svg notation... pass through
    return sym;
  }
  var renderer = symbolRenderers[sym.type];
  if (!renderer) {
    message(sym.type ? 'Unknown symbol type: ' + sym.type : 'Symbol is missing a type property');
    return empty();
  }
  var o = renderer(sym, x || 0, y || 0);
  if (sym.opacity) {
    o.properties.opacity = sym.opacity;
  }
  return o;
}

function empty() {
  return {tag: 'g', properties: {}, children: []};
}

function circle(d, x, y) {
  var o = {
    tag: 'circle',
    properties: {
      cx: x || 0,
      cy: y || 0
    }
  };
  applyStyleAttributes(o, 'point', d);
  return o;
}

function label(d, x, y) {
  var o = renderStyledLabel(d);
  if (x || y) {
    // set x, y here, rather than adding to dx, dy -- so dy, dy can
    // have CSS units (like ems)
    o.properties.transform = getTransform([x, y]);
  }
  return o;
}

function image(d, x, y) {
  var w = d.width || 20,
      h = d.height || 20;
  var o = {
    tag: 'image',
    properties: {
      width: w,
      height: h,
      x: (x || 0) - w / 2,
      y: (y || 0) - h / 2,
      href: d.href || ''
    }
  };
  if (d.fill) o.properties.fill = d.fill;
  return o;
}

function square(d, x, y) {
  var r = d.r || 0;
  var o = {
    tag: 'rect',
    properties: {
      x: x - r,
      y: y - r,
      width: r * 2,
      height: r * 2
    }
  };
  applyStyleAttributes(o, 'point', d, nonCirclePointFilter);
  return o;
}

function ring(d, x, y) {
  var o = circle(d, x, y);
  o.properties.fill = 'none';
  o.properties.stroke = d.fill;
  if (!o.properties['stroke-width']) {
    o.properties['stroke-width'] = 1;
  }
  return o;
}

function star(d) {
  var coords = getStarCoords(d.r);
  var o = importPolygon([coords]);
  applyStyleAttributes(o, 'point', d, nonCirclePointFilter);
  return o;
}

function nonCirclePointFilter(k) {
  return k != 'r';
}

function getStarCoords(r) {
  var coords = [];
  var innerR = r * 0.42;
  var angle, len;
  for (var i=0; i<10; i++) {
    len = i % 2 === 0 ? r : innerR;
    angle = -Math.PI / 2 + i * Math.PI / 5;
    coords.push([roundToTenths(Math.cos(angle) * len), roundToTenths(Math.sin(angle) * len)]);
  }
  coords.push(coords[0].concat());
  return coords;
}

function line(d, x, y) {
  var coords, o;
  coords = [[x, y], [x + (d.dx || 0), y + (d.dy || 0)]];
  o = importLineString(coords);
  applyStyleAttributes(o, 'polyline', d);
  return o;
}

// polyline coords are like GeoJSON MultiLineString coords: an array of 0 or more paths
function polyline(d) {
  var coords = d.coordinates || [];
  var o = importMultiLineString(coords);
  applyStyleAttributes(o, 'polyline', d);
  return o;
}

// polygon coords are an array of rings (and holes), like flattened MultiPolygon coords
function polygon(d) {
  var coords = d.coordinates || [];
  var o = importPolygon(coords);
  applyStyleAttributes(o, 'polygon', d);
  return o;
}

function offset(d, x, y) {
  var dx = (x || 0) + (d.dx || 0);
  var dy = (y || 0) + (d.dy || 0);
  return {
    tag: 'g',
    properties: {
      transform: getTransform([dx, dy])
    },
    children: []
  };
}

function group(d, x, y) {
  var o = {
    tag: 'g',
    children: []
  };
  var children = o.children;
  (d.parts || []).forEach(function(o) {
    var sym = renderComplexSymbol(o, x, y);
    children.push(sym);
    //if (d.chained) {
    //if (o.chained) {
    if (o.type == 'line') {
      x += (o.dx || 0);
      y += (o.dy || 0);
    }
    if (o.type == 'offset') {
      children = sym.children;
      x = y = 0;
    }
  });
  if (o.children.length == 1 && !o.properties) return o.children[0];
  return o;
}
