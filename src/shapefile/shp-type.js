var ShpType = {
  NULL: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5,
  MULTIPOINT: 8,
  POINTZ: 11,
  POLYLINEZ: 13,
  POLYGONZ: 15,
  MULTIPOINTZ: 18,
  POINTM: 21,
  POLYLINEM: 23,
  POLYGONM: 25,
  MULIPOINTM: 28,
  MULTIPATCH: 31 // not supported
};

export default ShpType;

ShpType.isPolygonType = function(t) {
  return t == 5 || t == 15 || t == 25;
};

ShpType.isPolylineType = function(t) {
  return t == 3 || t == 13 || t == 23;
};

ShpType.isMultiPartType = function(t) {
  return ShpType.isPolygonType(t) || ShpType.isPolylineType(t);
};

ShpType.isMultiPointType = function(t) {
  return t == 8 || t == 18 || t == 28;
};

ShpType.isZType = function(t) {
  return [11,13,15,18].includes(t);
};

ShpType.isMType = function(t) {
  return ShpType.isZType(t) || [21,23,25,28].includes(t);
};

ShpType.hasBounds = function(t) {
  return ShpType.isMultiPartType(t) || ShpType.isMultiPointType(t);
};
