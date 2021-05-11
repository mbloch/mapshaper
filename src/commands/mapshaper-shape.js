import { importGeoJSON } from '../geojson/geojson-import';
import GeoJSON from '../geojson/geojson-common';
import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { projectDataset } from '../commands/mapshaper-proj';
import { getCircleGeoJSON } from '../buffer/mapshaper-point-buffer';

cmd.shape = function(targetDataset, opts) {
  var geojson, dataset;
  if (opts.coordinates) {
    geojson = makeShapeFromCoords(opts);
  } else if (opts.type == 'circle') {
    geojson = makeCircle(opts);
  } else {
    stop('Missing coordinates parameter');
  }
  // TODO: project shape if targetDataset is projected
  dataset = importGeoJSON(geojson, {});
  dataset.layers[0].name = opts.name || 'shape';
  return dataset;
};

function makeCircle(opts) {
  if (opts.radius > 0 === false) {
    stop('Missing required radius parameter.');
  }
  var cp = opts.center || [0, 0];
  return getCircleGeoJSON(cp, opts.radius, null, {geometry_type : opts.geometry || 'polygon'});
}

function makeShapeFromCoords(opts) {
  var coordinates = [];
  var offsets = opts.offsets || [];
  var coords = opts.coordinates;
  var type, i, x, y;
  if (coords.length >= 2 === false) {
    stop('Invalid coordinates parameter.');
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
  return {
    type: type,
    coordinates: type == 'Polygon' ? [coordinates] : coordinates
  };

}
