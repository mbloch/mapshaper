import ShpType from '../shapefile/shp-type';

export function translateShapefileType(shpType) {
  if ([ShpType.POLYGON, ShpType.POLYGONM, ShpType.POLYGONZ].includes(shpType)) {
    return 'polygon';
  } else if ([ShpType.POLYLINE, ShpType.POLYLINEM, ShpType.POLYLINEZ].includes(shpType)) {
    return 'polyline';
  } else if ([ShpType.POINT, ShpType.POINTM, ShpType.POINTZ,
      ShpType.MULTIPOINT, ShpType.MULTIPOINTM, ShpType.MULTIPOINTZ].includes(shpType)) {
    return 'point';
  }
  return null;
}

export function isSupportedShapefileType(t) {
  return [0,1,3,5,8,11,13,15,18,21,23,25,28].includes(t);
}
