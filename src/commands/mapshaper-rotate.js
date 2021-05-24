
import cmd from '../mapshaper-cmd';
import { rotateDatasetCoords, getRotationFunction2 } from '../crs/mapshaper-spherical-rotation';
import { removePolygonCrosses, removePolylineCrosses } from '../geom/mapshaper-antimeridian';
import { DatasetEditor } from '../dataset/mapshaper-dataset-editor';
import { getDatasetCRS, isLatLngCRS } from '../crs/mapshaper-projections';
import { getPlanarPathArea, getSphericalPathArea } from '../geom/mapshaper-polygon-geom';
import { densifyDataset, densifyPathByInterval } from '../crs/mapshaper-densify';
import { cleanProjectedLayers } from '../commands/mapshaper-proj';
import { stop, error, debug } from '../utils/mapshaper-logging';
import { buildTopology } from '../topology/mapshaper-topology';
import {
  samePoint,
  snapToEdge,
  isEdgeSegment,
  isEdgePoint,
  isWholeWorld,
  touchesEdge,
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
    editor.editLayer(lyr, getGeometryRotator(type, rotatePoint));
  });
  editor.done();
  buildTopology(dataset);
  cleanProjectedLayers(dataset);
}

function getGeometryRotator(layerType, rotatePoint) {
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
        coords = densifyPathByInterval(coords, 0.5, densifySegment);
        coords = removeCutSegments(coords);
        coords.forEach(rotatePoint);
        coords.forEach(snapToEdge);
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
        return removePolygonCrosses(rings);
      }
    };
  }
  return null; // assume layer has no geometry -- callback should not be called
}

function densifySegment(a, b) {
  return !isEdgeSegment(a, b);
}

// Remove segments that belong solely to cut points
// TODO: verify that antimeridian crosses have matching y coords
// TODO: stitch together split-apart polygons
//
function removeCutSegments(coords) {
  if (!touchesEdge(coords)) return coords;
  var coords2 = [];
  var a, b, c, x, y;
  var skipped = false;
  coords.pop(); // remove duplicate point
  a = coords[coords.length-1];
  b = coords[0];
  for (var ci=1, n=coords.length; ci <= n; ci++) {
    c = ci == n ? coords2[0] : coords[ci];
    if (isEdgePoint(a) && isEdgeSegment(b, c)) {
      // skip b
      // debug('<edge', b)
      skipped = true;
    } else {
      if (skipped === true) {
        // console.log("skipped from:", coords2[coords2.length-1], 'to:', b)
        // console.log('ci:', ci, 'coords.length:', n)
        skipped = false;
      }
      coords2.push(b);
      a = b;
    }
    b = c;
  }
  coords2.push(coords2[0].concat()); // close the path
  // TODO: handle runs that are split at the array boundary
  return coords2;
}
