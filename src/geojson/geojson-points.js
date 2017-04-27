/* @requires geojson-common */

// Converts geometry in-place
GeoJSON.convertPointFeatureToSquare = function(feature, radiusField, fixedRadius) {
  var geom = feature.geometry;
  var side = (radiusField in feature.properties ? feature.properties[radiusField] : fixedRadius) * 2;
  if (side > 0 === false) {
    feature.geometry = null;
  } else if (geom.type == 'Point') {
    feature.geometry = {
      type: 'Polygon',
      coordinates: GeoJSON.convertPointCoordsToSquareCoords(geom.coordinates, side)
    };
  } else if (geom.type == 'MultiPoint') {
    feature.geometry = {
      type: 'MultiPolygon',
      coordinates: geom.coordinates.map(function(p) {
        return GeoJSON.convertPointCoordsToSquareCoords(p, side);
      })
    };
  }
};

GeoJSON.convertPointCoordsToSquareCoords = function(p, side) {
  var offs = side / 2,
      l = p[0] - offs,
      r = p[0] + offs,
      t = p[1] + offs,
      b = p[1] - offs;
  return [[[l, t], [r, t], [r, b], [l, b], [l, t]]];
};
