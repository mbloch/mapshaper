import { importGeoJSON } from '../geojson/geojson-import';
import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { isLatLngDataset } from '../crs/mapshaper-projections';
import { requirePointLayer, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import Delaunator from 'delaunator';
import { getPointsInLayer } from '../points/mapshaper-point-utils';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { greatCircleDistance, distance2D } from '../geom/mapshaper-basic-geom';
import { buildTopology } from '../topology/mapshaper-topology';
import { cleanLayers } from '../commands/mapshaper-clean';

cmd.alphaShapes = function(pointLyr, targetDataset, opts) {
  requirePointLayer(pointLyr);
  if (opts.interval > 0 === false) {
    stop('Expected a non-negative interval parameter');
  }
  var filter = getAlphaDistanceFilter(targetDataset, opts.interval);
  var dataset = getPolygonDataset(pointLyr, filter, opts);
  var merged = mergeDatasets([targetDataset, dataset]);
  var lyr = merged.layers.pop();
  targetDataset.arcs = merged.arcs;
  setOutputLayerName(lyr, pointLyr, null, opts);
  return lyr;
};

export function getAlphaDistanceFilter(dataset, interval) {
  return isLatLngDataset(dataset) ? getSphericalFilter(interval) : getPlanarFilter(interval);
}

function getPlanarFilter(interval) {
  return function(a, b) {
    return distance2D(a[0], a[1], b[0], b[1]) <= interval;
  };
}

// TODO: switch to real distance metric (don't assume meters, use CRS data)
function getSphericalFilter(interval) {
  return function(a, b) {
    return greatCircleDistance(a[0], a[1], b[0], b[1]) <= interval;
  };
}


function getTriangleDataset(lyr, filter, opts) {
  var points = getPointsInLayer(lyr);
  var del = Delaunator.from(points);
  var index = opts.keep_points ? new Uint8Array(points.length) : null;
  var triangles = del.triangles;
  var geojson = {
    type: 'MultiPolygon',
    coordinates: []
  };
  var a, b, c, ai, bi, ci;
  for (var i=0, n=triangles.length; i<n; i+=3) {
    // a, b, c: triangle verticies in CCW order
    ai = triangles[i];
    bi = triangles[i+1];
    ci = triangles[i+2];
    a = points[ai];
    b = points[bi];
    c = points[ci];
    if (!(filter(a, b) && filter(b, c) && filter(a, c))) continue;
    geojson.coordinates.push([[c, b, a, c]]);
    if (index) {
      index[ai] = 1;
      index[bi] = 1;
      index[ci] = 1;
    }
  }
  if (index) {
    addPointSymbols(geojson, points, index);
  }
  return importGeoJSON(geojson);
}

function addPointSymbols(geom, points, index) {
  var p;
  for (var i=0, n=index.length; i<n; i++) {
    if (index[i] === 0) {
      geom.coordinates.push(getPointSymbolCoords(points[i]));
    }
  }
}

function getPointSymbolCoords(p) {
  var d = 0.0001,
      x = p[0],
      y = p[1];
  return [[[x, y], [x, y+d], [x+d, y+d], [x+d, y], [x, y]]];
}

function getPolygonDataset(lyr, filter, opts) {
  var dataset = getTriangleDataset(lyr, filter, opts);
  buildTopology(dataset);
  if (!opts.debug) {
    cleanLayers(dataset.layers, dataset, {quiet: true});
  }
  return dataset;
}
