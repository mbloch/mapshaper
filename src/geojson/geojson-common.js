/* @requires
mapshaper-common
*/

var GeoJSON = MapShaper.geojson = {};
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
