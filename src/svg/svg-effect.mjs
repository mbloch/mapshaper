import utils from '../utils/mapshaper-utils';

export function getSphereEffectParams() {
  return {
    cx: 0.5,
    cy: 0.5,
    r: 0.57,
    fx: 0.35,
    fy: 0.35,
    stops: [
      {offset: 0.3, opacity: 0},
      {offset: 0.6, opacity: 0.1},
      {offset: 0.78, opacity: 0.25},
      {offset: 0.87, opacity: 0.45},
      {offset: 0.95, opacity: 1}]
  };
}

export function convertFillEffect(obj, defs) {
  if (obj['fill-effect'] != 'sphere') return; // only "sphere" is supported
  var id = 'mapshaper_sphere_effect';
  var href = `url(#${ id })`;
  var params = getSphereEffectParams();
  var stops = params.stops.map(function(stop) {
      return `<stop offset="${stop.offset}" stop-opacity="${stop.opacity}"/>`;
    });
  var svg =
`<radialGradient id="${id}" cx="${params.cx}" cy="${params.cy}" r="${params.r}" fx="${params.fx}" fy="${params.fy}">${stops.join('')}</radialGradient>`;
  if (!utils.find(defs, function(o) { return o.id == id; })) {
    defs.push({svg, id, href});
  }
  obj.fill = href;
  if ('opacity' in obj === false && 'fill-opacity' in obj === false) {
    obj['fill-opacity'] = 0.35;
  }
}