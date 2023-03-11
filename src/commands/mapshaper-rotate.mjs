
import cmd from '../mapshaper-cmd';
import { rotateDatasetCoords, getRotationFunction2 } from '../crs/mapshaper-spherical-rotation';
import {
  removePolygonCrosses,
  removePolylineCrosses,
  segmentCrossesAntimeridian,
  removeCutSegments } from '../geom/mapshaper-antimeridian-cuts';
import { DatasetEditor } from '../dataset/mapshaper-dataset-editor';
import { getDatasetCRS, isLatLngCRS } from '../crs/mapshaper-projections';
import { getPlanarPathArea, getSphericalPathArea } from '../geom/mapshaper-polygon-geom';
import {
  densifyDataset,
  densifyPathByInterval,
  densifyAntimeridianSegment,
  getIntervalInterpolator } from '../crs/mapshaper-densify';
import { cleanProjectedPathLayers } from '../commands/mapshaper-proj';
import { stop, error, debug } from '../utils/mapshaper-logging';
import { buildTopology } from '../topology/mapshaper-topology';
import {
  samePoint,
  snapToEdge,
  isEdgeSegment,
  isWholeWorld,
  onPole,
  isClosedPath,
  lastEl
} from '../paths/mapshaper-coordinate-utils';

cmd.rotate = rotateDataset;

export function rotateDataset(dataset, opts) {
  if (!isLatLngCRS(getDatasetCRS(dataset))) {
    stop('Command requires a lat-long dataset.');
  }
  if (!Array.isArray(opts.rotation) || !opts.rotation.length) {
    stop('Invalid rotation parameter');
  }
  var rotatePoint = getRotationFunction2(opts.rotation, opts.invert);
  var editor = new DatasetEditor(dataset);
  if (dataset.arcs) {
    dataset.arcs.flatten();
  }

  dataset.layers.forEach(function(lyr) {
    var type = lyr.geometry_type;
    editor.editLayer(lyr, getGeometryRotator(type, rotatePoint, opts));
  });
  editor.done();
  if (!opts.debug) {
    buildTopology(dataset);
    cleanProjectedPathLayers(dataset);
  }
}

function getGeometryRotator(layerType, rotatePoint, opts) {
  var rings;
  if (layerType == 'point') {
    return function(coords) {
      coords.forEach(rotatePoint);
      return coords;
    };
  }
  if (layerType == 'polyline') {
    return function(coords) {
      coords = densifyPathByInterval(coords, 0.5);
      coords.forEach(rotatePoint);
      return removePolylineCrosses(coords);
    };
  }
  if (layerType == 'polygon') {
    return function(coords, i, shape) {
      if (isWholeWorld(coords)) {
        coords = densifyPathByInterval(coords, 0.5);
      } else {
        coords.forEach(snapToEdge);
        coords = removeCutSegments(coords);
        coords = densifyPathByInterval(coords, 0.5, getInterpolator(0.5));
        coords.forEach(rotatePoint);
        // coords.forEach(snapToEdge);
      }
      if (i === 0) { // first part
        rings = [];
      }
      if (coords.length < 4) {
        debug('Short ring', coords);
        return;
      }
      if (!samePoint(coords[0], lastEl(coords))) {
        error('Open polygon ring');
      }
      rings.push(coords); // accumulate rings
      if (i == shape.length - 1) { // last part
        return opts.debug ? rings : removePolygonCrosses(rings);
      }
    };
  }
  return null; // assume layer has no geometry -- callback should not be called
}

function getInterpolator(interval) {
  var interpolate = getIntervalInterpolator(interval);
  return function(a, b) {
    var points;
    if (onPole(a) || onPole(b)) {
      points = [];
    } else if (isEdgeSegment(a, b)) {
      points = densifyAntimeridianSegment(a, b, interval);
    } else if (segmentCrossesAntimeridian(a, b)) {
      // TODO: interpolate up to antimeridian?
      points = [];
    } else {
      points = interpolate(a, b);
    }
    return points;
  };
}
