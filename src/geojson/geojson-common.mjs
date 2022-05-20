
var GeoJSON = {};
export default GeoJSON;

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

GeoJSON.toFeature = function(obj, properties) {
  var type = obj ? obj.type : null;
  var feat;
  if (type == 'Feature') {
    feat = obj;
  } else if (type in GeoJSON.typeLookup) {
    feat = {
      type: 'Feature',
      geometry: obj,
      properties: properties || null
    };
  } else {
    feat = {
      type: 'Feature',
      geometry: null,
      properties: properties || null
    };
  }
  return feat;
};
