import { rotateCoords, scaleAndShiftCoords, flipY, roundCoordsForSVG, getSymbolColor } from '../symbols/mapshaper-symbol-utils';
import { error } from '../utils/mapshaper-logging';

// Returns an svg-symbol data object for one symbol
export function makePolygonSymbol(coords, properties, geojsonType) {
  if (geojsonType == 'MultiPolygon') {
    coords = convertMultiPolygonCoords(coords);
  } else if (geojsonType != 'Polygon') {
    error('Unsupported type:', geojsonType);
  }
  roundCoordsForSVG(coords);
  return {
    type: 'polygon',
    coordinates: coords,
    fill: getSymbolColor(properties)
  };
}

function convertMultiPolygonCoords(coords) {
  return coords.reduce(function(memo, poly) {
    return memo.concat(poly);
  }, []);
}
