import { importGeoJSON } from '../geojson/geojson-import';
import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { isLatLngDataset } from '../crs/mapshaper-projections';
import {
  requirePointLayer, getLayerBounds, countMultiPartFeatures, setOutputLayerName
} from '../dataset/mapshaper-layer-utils';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { forEachPoint, getPointsInLayer } from '../points/mapshaper-point-utils';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { greatCircleDistance } from '../geom/mapshaper-basic-geom';
import { buildTopology } from '../topology/mapshaper-topology';
import { cleanLayers } from '../commands/mapshaper-clean';
import { getJoinCalc } from '../join/mapshaper-join-calc';
import require from '../mapshaper-require';
import { twoCircleIntersection } from '../grids/mapshaper-grid-utils';
import { getSquareGridMaker } from '../grids/mapshaper-square-grid';
import { getGridToPointIndex } from '../grids/mapshaper-grid-to-point-index';

cmd.pointToGrid = function(targetLayers, targetDataset, opts) {
  targetLayers.forEach(requirePointLayer);
  if (opts.interval > 0 === false) {
    stop('Expected a non-negative interval parameter');
  }
  if (opts.radius > 0 === false) {
    // stop('Expected a non-negative radius parameter');
  }
  // var bbox = getLayerBounds(pointLyr).toArray();
  // Use target dataset, so grids are aligned between layers
  // TODO: align grids between datasets
  var bbox = getDatasetBounds(targetDataset).toArray();

  var datasets = [targetDataset];
  var outputLayers = targetLayers.map(function(pointLyr) {
    if (countMultiPartFeatures(pointLyr) > 0) {
      stop('This command requires single points');
    }
    var dataset = getPolygonDataset(pointLyr, bbox, opts);
    var gridLyr = dataset.layers[0];
    datasets.push(dataset);
    setOutputLayerName(gridLyr, pointLyr, 'grid', opts);
    return gridLyr;
  });

  var merged = mergeDatasets(datasets);
  // build topology for the entire dataset, in case the command is used on
  // multiple target layers.
  buildTopology(merged);
  targetDataset.arcs = merged.arcs;
  return outputLayers;
};

function getPolygonDataset(pointLyr, gridBBox, opts) {
  var points = getPointsInLayer(pointLyr);
  var cellSize = opts.interval;
  var grid = getSquareGridMaker(gridBBox, cellSize, opts);
  var pointCircleRadius = getPointCircleRadius(opts);
  var findPointIdsByCellId = getGridToPointIndex(points, grid, pointCircleRadius);
  var geojson = {
    type: 'FeatureCollection',
    features: []
  };
  var calc = opts.calc ? getJoinCalc(pointLyr.data, opts.calc) : null;
  var candidateIds, weights, center, weight, d;

  for (var i=0, n=grid.cells(); i<n; i++) {
    candidateIds = findPointIdsByCellId(i);
    if (!candidateIds.length) continue;
    center = grid.idxToPoint(i);
    weights = calcWeights(center, cellSize, points, candidateIds, pointCircleRadius);
    d = calcCellProperties(candidateIds, weights, calc);
    if (d.weight > 0.05 === false) continue;
    d.id = i;
    geojson.features.push({
      type: 'Feature',
      properties: d,
      geometry: grid.makeCellPolygon(i, opts)
    });
  }
  return importGeoJSON(geojson, {});
}

export function getPointCircleRadius(opts) {
  var cellRadius = opts.interval * Math.sqrt(1 / Math.PI);
  return opts.radius > 0 ? opts.radius : cellRadius;
}

export function calcCellProperties(pointIds, weights, calc) {
  var hitIds = [];
  var weight = 0;
  var partial;
  var d;
  for (var i=0; i<pointIds.length; i++) {
    partial = weights[i];
    if (partial > 0 === false) continue;
    weight += partial;
    hitIds.push(pointIds[i]);
  }
  d = {weight: weight};
  if (calc) {
    calc(hitIds, d);
  }
  return d;
}

export function calcWeights(cellCenter, cellSize, points, pointIds, pointRadius) {
  var weights = [];
  var cellRadius = cellSize * Math.sqrt(1 / Math.PI); // radius of circle with same area as cell
  var cellArea = cellSize * cellSize;
  var w;
  for (var i=0; i<pointIds.length; i++) {
    w = twoCircleIntersection(cellCenter, cellRadius, points[pointIds[i]], pointRadius) / cellArea;
    weights.push(w);
  }
  return weights;
}

// function getPointsByIndex(points, indices) {
//   var arr = [];
//   for (var i=0; i<indices.length; i++) {
//     arr.push(points[indices[i]]);
//   }
//   return arr;
// }
