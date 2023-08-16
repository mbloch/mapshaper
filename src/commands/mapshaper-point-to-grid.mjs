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
import { greatCircleDistance, distance2D } from '../geom/mapshaper-basic-geom';
import { buildTopology } from '../topology/mapshaper-topology';
import { cleanLayers } from '../commands/mapshaper-clean';
import { getPlanarSegmentEndpoint } from '../geom/mapshaper-geodesic';
import { getPointBufferCoordinates } from '../buffer/mapshaper-point-buffer';
import { IdTestIndex } from '../indexing/mapshaper-id-test-index';
import { getJoinCalc } from '../join/mapshaper-join-calc';
import require from '../mapshaper-require';

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
  var grid = getGridData(gridBBox, cellSize, opts);
  var pointCircleRadius = getPointCircleRadius(opts);
  var findPointIdsByCellId = getPointIndex(points, grid, pointCircleRadius);
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
      geometry: makeCellPolygon(i, grid, opts)
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

// Source: https://diego.assencio.com/?index=8d6ca3d82151bad815f78addf9b5c1c6
export function twoCircleIntersection(c1, r1, c2, r2) {
  var d = distance2D(c1[0], c1[1], c2[0], c2[1]);
  if (d >= r1 + r2) return 0;
  var r1sq = r1 * r1,
      r2sq = r2 * r2,
      d1 = (r1sq - r2sq + d * d) / (2 * d),
      d2 = d - d1;
  if (d <= Math.abs(r1 - r2)) {
    return Math.PI * Math.min(r1sq, r2sq);
  }
  return r1sq * Math.acos(d1/r1) - d1 * Math.sqrt(r1sq - d1 * d1) +
    r2sq * Math.acos(d2/r2) - d2 * Math.sqrt(r2sq - d2 * d2);
}

export function makeCellPolygon(idx, grid, opts) {
  var coords = opts.circles ?
    makeCircleCoords(grid.idxToPoint(idx), opts) :
    makeCellCoords(grid.idxToBBox(idx), opts);
  return {
    type: 'Polygon',
    coordinates: [coords]
  };
}

function makeCellCoords(bbox, opts) {
  var margin = opts.interval * (opts.cell_margin || 0);
  var a = bbox[0] + margin,
      b = bbox[1] + margin,
      c = bbox[2] - margin,
      d = bbox[3] - margin;
  return [[a, b],[a, d],[c, d],[c, b],[a, b]];
}

export function makeCircleCoords(center, opts) {
  var margin = opts.cell_margin > 0 ? opts.cell_margin : 1e-6;
  var radius = opts.interval / 2 * (1 - margin);
  var vertices = opts.vertices || 20;
  return getPointBufferCoordinates(center, radius, vertices, getPlanarSegmentEndpoint);
}

// Returns a function that receives a cell index and returns indices of points
//   within a given distance of the cell.
export function getPointIndex(points, grid, radius) {
  var Flatbush = require('flatbush');
  var gridIndex = new IdTestIndex(grid.cells());
  var bboxIndex = new Flatbush(points.length);
  var empty = [];
  points.forEach(function(p) {
    var bbox = getPointBounds(p, radius);
    addPointToGridIndex(p, gridIndex, grid);
    bboxIndex.add.apply(bboxIndex, bbox);
  });
  bboxIndex.finish();
  return function(i) {
    if (!gridIndex.hasId(i)) {
      return empty;
    }
    var bbox = grid.idxToBBox(i);
    var indices = bboxIndex.search.apply(bboxIndex, bbox);
    return indices;
  };
}

function getPointsByIndex(points, indices) {
  var arr = [];
  for (var i=0; i<indices.length; i++) {
    arr.push(points[indices[i]]);
  }
  return arr;
}

function addPointToGridIndex(p, index, grid) {
  var i = grid.pointToIdx(p);
  var c = grid.idxToCol(i);
  var r = grid.idxToRow(i);
  addCellToGridIndex(c+1, r+1, grid, index);
  addCellToGridIndex(c+1, r, grid, index);
  addCellToGridIndex(c+1, r-1, grid, index);
  addCellToGridIndex(c, r+1, grid, index);
  addCellToGridIndex(c, r, grid, index);
  addCellToGridIndex(c, r-1, grid, index);
  addCellToGridIndex(c-1, r+1, grid, index);
  addCellToGridIndex(c-1, r, grid, index);
  addCellToGridIndex(c-1, r-1, grid, index);
}

function addCellToGridIndex(c, r, grid, index) {
  var i = grid.colRowToIdx(c, r);
  if (i > -1) index.setId(i);
}

// TODO: support spherical coords
function getPointBounds(p, radius) {
  return [p[0] - radius, p[1] - radius, p[0] + radius, p[1] + radius];
}

// grid boundaries includes the origin
// (this way, grids calculated from different sets of points will all align)
function getAlignedRange(minCoord, maxCoord, interval) {
  var idx = Math.floor(minCoord / interval) - 1;
  var idx2 = Math.ceil(maxCoord / interval) + 1;
  return [idx * interval, idx2 * interval];
}

function getCenteredRange(minCoord, maxCoord, interval) {
  var w = maxCoord - minCoord;
  var w2 = Math.ceil(w / interval) * interval;
  var pad = (w2 - w) / 2 + interval;
  return [minCoord - pad, maxCoord + pad];
}

export function getAlignedGridBounds(bbox, interval) {
  var xx = getAlignedRange(bbox[0], bbox[2], interval);
  var yy = getAlignedRange(bbox[1], bbox[3], interval);
  return [xx[0], yy[0], xx[1], yy[1]];
}

export function getCenteredGridBounds(bbox, interval) {
  var xx = getCenteredRange(bbox[0], bbox[2], interval);
  var yy = getCenteredRange(bbox[1], bbox[3], interval);
  return [xx[0], yy[0], xx[1], yy[1]];
}

// TODO: Use this function for other grid-based commands
export function getGridData(bbox, interval, opts) {
  var extent = opts && opts.aligned ?
    getAlignedGridBounds(bbox, interval) :
    getCenteredGridBounds(bbox, interval);
  var xmin = extent[0];
  var ymin = extent[1];
  var w = extent[2] - xmin;
  var h = extent[3] - ymin;
  var cols = Math.round(w / interval);
  var rows = Math.round(h / interval);
  // var xmin = bbox[0] - interval;
  // var ymin = bbox[1] - interval;
  // var xmax = bbox[2] + interval;
  // var ymax = bbox[3] + interval;
  // var w = xmax - xmin;
  // var h = ymax - ymin;
  // var cols = Math.ceil(w / interval);
  // var rows = Math.ceil(h / interval);
  function size() {
    return [cols, rows];
  }
  function cells() {
    return cols * rows;
  }
  function pointToCol(xy) {
    var dx = xy[0] - xmin;
    return Math.floor(dx / w * cols);
  }
  function pointToRow(xy) {
    var dy = xy[1] - ymin;
    return Math.floor(dy / h * rows);
  }
  function colRowToIdx(c, r) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    return r * cols + c;
  }
  function pointToIdx(xy) {
    var c = pointToCol(xy);
    var r = pointToRow(xy);
    return colRowToIdx(c, r);
  }
  function idxToCol(i) {
    return i % cols;
  }
  function idxToRow(i) {
    return Math.floor(i / cols);
  }
  function idxToPoint(idx) {
    var x = xmin + (idxToCol(idx) + 0.5) * interval;
    var y = ymin + (idxToRow(idx) + 0.5) * interval;
    return [x, y];
  }
  function idxToBBox(idx) {
    var c = idxToCol(idx);
    var r = idxToRow(idx);
    return [
      xmin + c * interval, ymin + r * interval,
      xmin + (c + 1) * interval, ymin + (r + 1) * interval
    ];
  }

  return {
    size, cells, pointToCol, pointToRow, colRowToIdx, pointToIdx,
    idxToCol, idxToRow, idxToBBox, idxToPoint
  };
}
