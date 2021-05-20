
import cmd from '../mapshaper-cmd';
import { rotateDatasetCoords, getRotationFunction2 } from '../crs/mapshaper-spherical-rotation';
import { removeAntimeridianCrosses } from '../geom/mapshaper-antimeridian';
import { DatasetEditor } from '../dataset/mapshaper-dataset-editor';
import { getDatasetCRS, isLatLngCRS } from '../crs/mapshaper-projections';
import { getPlanarPathArea, getSphericalPathArea } from '../geom/mapshaper-polygon-geom';
import { densifyDataset, densifyPathByInterval } from '../crs/mapshaper-densify';
import { stop } from '../utils/mapshaper-logging';

cmd.rotate = rotateDataset;

export function rotateDataset(dataset, opts) {
  if (!isLatLngCRS(getDatasetCRS(dataset))) {
    stop('Command requires a lat-long dataset.');
  }
  if (!Array.isArray(opts.rotation) || !opts.rotation.length) {
    stop('Invalid rotation parameter.');
  }
  var rotatePoint = getRotationFunction2(opts.rotation, opts.invert);
  var editor = new DatasetEditor(dataset);
  var originalArcs;
  if (dataset.arcs) {
    dataset.arcs.flatten();
    // make a copy so we can calculate original path winding after rotation
    originalArcs = dataset.arcs.getCopy();
  }

  dataset.layers.forEach(function(lyr) {
    var type = lyr.geometry_type;
    editor.editLayer(lyr, function(coords, i, shape) {
      if (type == 'point') {
        coords.forEach(rotatePoint);
        return coords;
      }
      coords = densifyPathByInterval(coords, 0.5);
      coords.forEach(rotatePoint);
      if (type == 'polyline') {
        return removeAntimeridianCrosses(coords, type);
      }
      var isHole = type == 'polygon' && getPlanarPathArea(shape[i], originalArcs) < 0;
      var coords2 = removeAntimeridianCrosses(coords, type, isHole);
      return coords2.reduce(function(memo, polygonCoords) {
        return memo.concat(polygonCoords);
      }, []);
    });
  });
  editor.done();
}
