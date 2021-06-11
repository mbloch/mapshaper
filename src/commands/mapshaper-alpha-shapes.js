import { importGeoJSON } from '../geojson/geojson-import';
import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { isLatLngDataset } from '../crs/mapshaper-projections';
import { requirePointLayer, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import Delaunator from 'delaunator';
import { forEachPoint } from '../points/mapshaper-point-utils';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { greatCircleDistance, distance2D } from '../geom/mapshaper-basic-geom';
import { buildTopology } from '../topology/mapshaper-topology';
import { cleanLayers } from '../commands/mapshaper-clean';

cmd.alphaShapes = function(pointLyr, targetDataset, opts) {
  requirePointLayer(pointLyr);
  if (opts.interval > 0 === false) {
    stop('Expected a non-negative interval parameter');
  }
  var filter = isLatLngDataset(targetDataset) ? getSphericalFilter(opts.interval) : getPlanarFilter(opts.interval);
  var dataset = getPolygonDataset(pointLyr, filter, opts);
  var merged = mergeDatasets([targetDataset, dataset]);
  var lyr = merged.layers.pop();
  targetDataset.arcs = merged.arcs;
  setOutputLayerName(lyr, pointLyr, null, opts);
  return lyr;
};

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

function getTriangleDataset(lyr, filter) {
  var points = getPointArr(lyr);
  var del = Delaunator.from(points);
  var triangles = del.triangles;
  var geojson = {
    type: 'MultiPolygon',
    coordinates: []
  };
  var a, b, c;
  for (var i=0, n=triangles.length; i<n; i+=3) {
    // a, b, c: triangle verticies in CCW order
    a = points[triangles[i]];
    b = points[triangles[i+1]];
    c = points[triangles[i+2]];
    if (filter(a, b) && filter(b, c) && filter(a, c)) {
      geojson.coordinates.push([[c, b, a, c]]);
    }
  }
  return importGeoJSON(geojson);
}

function getPolygonDataset(lyr, filter, opts) {
  var dataset = getTriangleDataset(lyr, filter);
  buildTopology(dataset);
  if (!opts.debug) {
    cleanLayers(dataset.layers, dataset, {quiet: true});
  }
  return dataset;
}

function getPointArr(lyr) {
  var coords = [];
  forEachPoint(lyr.shapes, function(p) {
    coords.push(p);
  });
  return coords;
}
