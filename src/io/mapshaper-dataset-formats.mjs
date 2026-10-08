import { PACKAGE_EXT } from '../pack/mapshaper-pack';
import { runningInBrowser } from '../mapshaper-env';


export function isSupportedOutputFormat(fmt) {
  var types = ['geojson', 'topojson', 'json', 'dsv', 'dbf', 'shapefile', 'svg', 'html', 'kml', PACKAGE_EXT, 'flatgeobuf', 'geopackage', 'geoparquet', 'geotiff'];
  return types.indexOf(fmt) > -1 || isMapImageFormat(fmt) && runningInBrowser();
}

// PNG and JPEG images of the map, which only the web UI exports
export function isMapImageFormat(fmt) {
  return fmt == 'png' || fmt == 'jpg';
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
    geoparquet: 'GeoParquet',
    geotiff: 'GeoTIFF',
    svg: 'SVG',
    html: 'HTML',
    png: 'PNG',
    jpg: 'JPEG'
  }[fmt] || '';
}

