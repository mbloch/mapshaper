import { roundCoordsForSVG, applySymbolStyles } from '../symbols/mapshaper-symbol-utils';
import { error } from '../utils/mapshaper-logging';
import { flattenMultiPolygonCoords } from '../svg/geojson-to-svg';

// Returns an svg-symbol data object for one symbol
export function makePathSymbol(coords, properties, geojsonType) {
  var sym;
  if (geojsonType == 'MultiPolygon' || geojsonType == 'Polygon') {
    sym = {
      type: 'polygon',
      coordinates: geojsonType == 'Polygon' ? coords : flattenMultiPolygonCoords(coords)
    };
  } else if (geojsonType == 'LineString' || geojsonType == 'MultiLineString') {
    sym = {
      type: 'polyline',
      'stroke-width': properties['stroke-width'] || 2,
      coordinates: geojsonType == 'LineString' ? [coords] : coords
    };
  } else {
    error('Unsupported type:', geojsonType);
  }
  applySymbolStyles(sym, properties);
  roundCoordsForSVG(sym.coordinates);
  return sym;
}
