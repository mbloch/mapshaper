import { getPolygonCoords } from './mapshaper-basic-symbols';
import { parseNumberList } from '../cli/mapshaper-option-parsing-utils';
import utils from '../utils/mapshaper-utils';
import { getSymbolFillColor } from './mapshaper-symbol-utils';
import { roundToTenths } from '../geom/mapshaper-rounding';

// Returns a svg-symbol object
export function makeRingSymbol(d, opts) {
  var scale = +opts.scale || 1;
  var radii = parseRings(d.radii || '2').map(function(r) { return r * scale; });
  var solidCenter = utils.isOdd(radii.length);
  var color = getSymbolFillColor(d);
  var opacity = opts.opacity || undefined;
  var parts = [];
  if (solidCenter) {
    parts.push({
      type: 'circle',
      fill: color,
      opacity: opacity,
      r: radii.shift()
    });
  }
  for (var i=0; i<radii.length; i+= 2) {
    parts.push({
      type: 'circle',
      fill: 'none', // TODO remove default black fill so this is not needed
      stroke: color,
      opacity: opacity,
      'stroke-width':  roundToTenths(radii[i+1] - radii[i]),
      r: roundToTenths(radii[i+1] * 0.5 + radii[i] * 0.5)
    });
  }
  return {
    type: 'group',
    parts: parts
  };
}

// Returns GeoJSON MultiPolygon coords
export function getRingCoords(d) {
  var radii = parseRings(d.radii || '2');
  var coords = [];
  var solidCenter = utils.isOdd(radii.length);
  var ring, hole;
  for (var i=0; i<radii.length; i++) {
    ring = getPolygonCoords({
      type: 'circle',
      radius: radii[i]
    });
    if (!solidCenter || i > 0) {
      i++;
      hole = ring;
      ring = getPolygonCoords({
        type: 'circle',
        radius: radii[i]
      });
      ring.push(hole[0]);
    }
    coords.push(ring);
  }
  return coords;
}

function parseRings(arg) {
  var arr = Array.isArray(arg) ? arg : parseNumberList(arg);
  utils.genericSort(arr, true);
  return utils.uniq(arr);
}
