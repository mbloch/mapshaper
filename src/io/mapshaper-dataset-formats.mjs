import { PACKAGE_EXT } from '../pack/mapshaper-pack';


export function isSupportedOutputFormat(fmt) {
  var types = ['geojson', 'topojson', 'json', 'dsv', 'dbf', 'shapefile', 'svg', 'kml', PACKAGE_EXT, 'flatgeobuf', 'geopackage'];
  return types.indexOf(fmt) > -1;
}

export function getFormatName(fmt) {
  return {
    geojson: 'GeoJSON',
    topojson: 'TopoJSON',
    json: 'JSON records',
    dsv: 'CSV',
    dbf: 'DBF',
    kml: 'KML',
    kmz: 'KMZ',
    [PACKAGE_EXT]: 'Snapshot file',
    shapefile: 'Shapefile',
    flatgeobuf: 'Flatgeobuf',
    geopackage: 'GeoPackage',
    svg: 'SVG'
  }[fmt] || '';
}

