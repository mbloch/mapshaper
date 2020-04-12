import { importGeoJSON } from '../geojson/geojson-import';
import GeoJSON from '../geojson/geojson-common';
import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';

cmd.shape = function(opts) {
  var coords = opts.coordinates;
  var offsets = opts.offsets || [];
  var coordinates = [];
  var geojson, dataset, type, i, x, y;

  if (!coords || coords.length >= 2 === false) {
    stop('Missing list of coordinates');
  }
  for (i=0; i<coords.length; i+= 2) {
    x = coords[i];
    y = coords[i + 1];
    coordinates.push([x, y]);
  }
  for (i=0; i<offsets.length; i+=2) {
    x += offsets[i];
    y += offsets[i + 1];
    coordinates.push([x, y]);
  }
  if (GeoJSON.pathIsRing(coordinates)) {
    type = 'Polygon';
  } else if (opts.closed && coordinates.length >= 3) {
    type = 'Polygon';
    coordinates.push(coordinates[0]);
  } else {
    type = 'LineString';
  }
  geojson = {
    type: type,
    coordinates: type == 'Polygon' ? [coordinates] : coordinates
  };
  dataset = importGeoJSON(geojson, {});
  dataset.layers[0].name = opts.name || 'shape';
  return dataset;
};
