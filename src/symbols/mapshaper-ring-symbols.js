import { getPolygonCoords } from './mapshaper-basic-symbols';
import { parseNumberList } from '../cli/mapshaper-option-parsing-utils';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

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
