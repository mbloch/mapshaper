import { roundCoordsForSVG, getSymbolFillColor, getSymbolStrokeColor } from '../symbols/mapshaper-symbol-utils';
import { error } from '../utils/mapshaper-logging';
import { flattenMultiPolygonCoords } from '../svg/geojson-to-svg';

// Returns an svg-symbol data object for one symbol
export function makePathSymbol(coords, properties, geojsonType) {
  var sym;
  if (geojsonType == 'MultiPolygon' || geojsonType == 'Polygon') {
    sym = {
      type: 'polygon',
      fill: getSymbolFillColor(properties),
      coordinates: geojsonType == 'Polygon' ? coords : flattenMultiPolygonCoords(coords)
    };
  } else if (geojsonType == 'LineString' || geojsonType == 'MultiLineString') {
    sym = {
      type: 'polyline',
      stroke: getSymbolStrokeColor(properties),
      'stroke-width': properties['stroke-width'] || 2,
      coordinates: geojsonType == 'LineString' ? [coords] : coords
    };
  } else {
    error('Unsupported type:', geojsonType);
  }
  roundCoordsForSVG(sym.coordinates);
  return sym;
}
