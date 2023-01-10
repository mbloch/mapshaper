import { importGeoJSON } from '../geojson/geojson-import';
import GeoJSON from '../geojson/geojson-common';
import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';
import { parseCrsString } from '../crs/mapshaper-projections';
import { getCircleGeoJSON } from '../buffer/mapshaper-point-buffer';
import { getCircleRadiusFromAngle } from '../crs/mapshaper-proj-utils';
import { rotateDatasetCoords } from '../crs/mapshaper-spherical-rotation';

cmd.shape = function(targetDataset, opts) {
  var geojson, dataset;
  if (opts.coordinates) {
    geojson = makeShapeFromCoords(opts);
  } else if (opts.type == 'circle') {
    geojson = makeCircle(opts);
  } else if (opts.type == 'rectangle' && opts.bbox) {
    geojson = getRectangleGeoJSON(opts);
  } else {
    stop('Missing coordinates parameter');
  }
  // TODO: project shape if targetDataset is projected
  dataset = importGeoJSON(geojson, {});
  if (opts.rotation) {
    rotateDatasetCoords(dataset, opts.rotation);
  }
  dataset.layers[0].name = opts.name || opts.type || 'shape';
  return dataset;
};

function getRectangleGeoJSON(opts) {
  var bbox = opts.bbox,
      xmin = bbox[0],
      ymin = bbox[1],
      xmax = bbox[2],
      ymax = bbox[3],
      interval = 0.5,
      coords = [],
      type = opts.geometry == 'polyline' ? 'LineString' : 'Polygon';
  addSide(xmin, ymin, xmin, ymax);
  addSide(xmin, ymax, xmax, ymax);
  addSide(xmax, ymax, xmax, ymin);
  addSide(xmax, ymin, xmin, ymin);
  coords.push([xmin, ymin]);
  return {
    type: type,
    coordinates: type == 'Polygon' ? [coords] : coords
  };

  function addSide(x1, y1, x2, y2) {
    var dx = x2 - x1,
        dy = y2 - y1,
        n = Math.ceil(Math.max(Math.abs(dx) / interval, Math.abs(dy) / interval)),
        xint = dx / n,
        yint = dy / n;
    for (var i=0; i<n; i++) {
      coords.push([x1 + i * xint, y1 + i * yint]);
    }
  }
}

function makeCircle(opts) {
  if (opts.radius > 0 === false && opts.radius_angle > 0 === false) {
    stop('Missing required radius parameter.');
  }
  var cp = opts.center || [0, 0];
  var radius = opts.radius || getCircleRadiusFromAngle(parseCrsString('wgs84'), opts.radius_angle);
  return getCircleGeoJSON(cp, radius, null, {geometry_type : opts.geometry || 'polygon'});
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
