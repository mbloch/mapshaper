/* @requires
mapshaper-common
*/

var GeoJSON = {};
GeoJSON.ID_FIELD = "FID"; // default field name of imported *JSON feature ids

GeoJSON.typeLookup = {
  LineString: 'polyline',
  MultiLineString: 'polyline',
  Polygon: 'polygon',
  MultiPolygon: 'polygon',
  Point: 'point',
  MultiPoint: 'point'
};

GeoJSON.translateGeoJSONType = function(type) {
  return GeoJSON.typeLookup[type] || null;
};

GeoJSON.pathIsRing = function(coords) {
  var first = coords[0],
      last = coords[coords.length - 1];
  // TODO: consider detecting collapsed rings
  return coords.length >= 4 && first[0] == last[0] && first[1] == last[1];
};
