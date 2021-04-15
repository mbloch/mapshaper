import geom from '../geom/mapshaper-geom';
import { testPointInPolygon } from '../geom/mapshaper-polygon-geom';
import { error } from '../utils/mapshaper-logging';
import { MaxHeap } from '../simplify/mapshaper-heap';
import utils from '../utils/mapshaper-utils';
// TODO: optimize point-in-polygon tests for complex polygons and many points
// import { PathIndex } from '../paths/mapshaper-path-index';

export function placeDotsInPolygon(shp, arcs, n, opts) {
  var evenness = opts.evenness >= 0 ? Math.min(opts.evenness, 1) : 1;
  // TODO: also skip tiny sliver polygons?
  if (n === 0) return [];
  if (evenness === 0) return placeDotsRandomly(shp, arcs, n);
  // TODO: if n == 1, consider using the 'inner' point
  return placeDotsEvenly(shp, arcs, n, evenness);
}

function placeDotsRandomly(shp, arcs, n) {
  var bounds = arcs.getMultiShapeBounds(shp);
  var coords = [];
  for (var i=0; i<n; i++) {
    coords.push(placeRandomDot(shp, arcs, bounds));
  }
  return coords;
}

function placeRandomDot(shp, arcs, bounds) {
  var limit = 100;
  var i = 0;
  var x, y;
  while (++i < limit) {
    x = bounds.xmin + Math.random() * bounds.width();
    y = bounds.ymin + Math.random() * bounds.height();
    if (testPointInPolygon(x, y, shp, arcs)) {
      return [x, y];
    }
  }
  return null;
}

function placeDotsEvenly(shp, arcs, n, evenness) {
  var shpArea = geom.getPlanarShapeArea(shp, arcs);
  if (shpArea > 0 === false) return [];
  var bounds = arcs.getMultiShapeBounds(shp);
  var approxQueries = Math.round(n * bounds.area() / shpArea);
  var grid = new DotGrid(bounds, approxQueries, evenness);
  var coords = [];
  for (var i=0; i<n; i++) {
    coords.push(placeDot(shp, arcs, grid));
  }
  grid.done();
  return coords;
}

function placeDot(shp, arcs, grid, bounds) {
  var i = 0;
  var limit = 100;
  var p;
  while (++i < limit) {
    p = grid.getPoint();
    if (!p) continue;
    if (testPointInPolygon(p[0], p[1], shp, arcs)) {
      return p;
    }
  }
  return null;
}

function DotGrid(bounds, approxQueries, evenness) {
  var x0 = bounds.xmin;
  var y0 = bounds.ymin;
  var w = bounds.width();
  var h = bounds.height();
  var approxCells = approxQueries * 0.8;
  var cols = Math.round(Math.sqrt(approxCells * w / h)) || 1;
  var rows = Math.ceil(cols * h / w); // overshoots bbox height
  var gridWidth = w;
  var gridHeight = w * rows / cols;
  var cells = cols * rows;
  var cellId = -1;
  var grid = initGrid(cells);
  // data used by optimal method
  var bestPoints;
  var bestHeap;

  // Estimate the initial distance threshold between dots (based on a square grid)
  // When evenness == 1, the initial value should be larger than the final
  //   spacing between dots, after all the dots are added.
  // When evenness < 1 (dart-throwing mode) the distance threshold is reduced in
  //   proportion to the value of evenness.
  var k = Math.pow(evenness, 0.85); // applying a curve seems create a better scale
  // From trial and error, 0.75 seems to give a good result.
  var minDist = gridWidth / cols * 0.75 * k;

  // metrics
  var queries = 0;
  var lastDistSq = 0;
  var bestCount = 0;

  return {done: done, getPoint: getPoint};

  function done() {
    // console.log( 'queries:', queries,'bestPct:', pct(bestCount, queries), "minDist:", Math.round(minDist), "lastDist:", Math.round(Math.sqrt(lastDistSq)));
    function pct(a, b) {
      return Math.round(a / b * 100) + '%';
    }
  }

  function getPoint() {
    queries++;
    if (evenness === 1) return getOptimalPoint();
    if (evenness === 0) return getRandomPoint();
    return getSpacedPoint();
  }

  function initGrid(n) {
    var arr = [];
    for (var i=0; i<n; i++) arr.push([]);
    return arr;
  }

  function getOptimalPoint() {
    var p;
    // first, try to place a random but well-spaced point in each grid cell
    // (to create an initial sparse structure that gets filled in later)
    while (++cellId < cells) {
      p = getRandomPointInCell(cellId);
      if (pointIsUsable(p)) {
        return usePoint(p);
      }
    }
    // fill in the gaps of the initial placement, starting with the largest gap
    if (!bestPoints) {
      initBestPoints();
    }
    return useBestPoint();
  }

  function getSpacedPoint() {
    // use dart-throwing, reject points that are within the minimum distance
    var probesBeforeRelaxation = Math.ceil(Math.pow(cells, 0.8));
    var maxProbes = cells * 10;
    var probes = 0;
    var p;
    while (probes++ < maxProbes) {
      p = getRandomPoint();
      if (pointIsUsable(p)) {
        return usePoint(p);
      }
      if (probes % probesBeforeRelaxation === 0) {
        // relax min dist after a number of failed probes
        minDist *= 0.9;
      }
    }
    return null;
  }

  // Add point to grid of used points
  function usePoint(p) {
    var i = pointToIdx(p);
    grid[i].push(p);
    return p;
  }

  function useBestPoint() {
    var bestId = bestHeap.peek();
    var p = bestPoints[bestId];
    usePoint(p); // add to grid of used points
    updateNeighbors(p, bestId); // update best point of this cell and neighbors
    lastDistSq = bestHeap.peekValue();
    bestCount++;
    return p;
  }

  function initBestPoints() {
    var values = [];
    bestPoints = [];
    var distSq;
    for (var i=0; i<cells; i++) {
      distSq = findBestPointInCell(i);
      values.push(distSq);
    }
    bestHeap = new MaxHeap();
    bestHeap.init(values);
  }

  function updateNeighbors(p, i) {
    var r = idxToRow(i);
    var c = idxToCol(i);
    updateBestPointInCell(i);
    updateNeighbor(p, c+1, r);
    updateNeighbor(p, c, r+1);
    updateNeighbor(p, c-1, r);
    updateNeighbor(p, c, r-1);
    updateNeighbor(p, c+1, r+1);
    updateNeighbor(p, c-1, r+1);
    updateNeighbor(p, c-1, r-1);
    updateNeighbor(p, c+1, r-1);
  }

  function updateNeighbor(addedPt, c, r) {
    var i = colRowToIdx(c, r);
    if (i == -1) return;
    var bestPt = bestPoints[i];
    // don't need to update best point if the newly added point is too far away
    // to have an effect.
    // (about 80% of updates are skipped, typically)
    if (distSq(addedPt, bestPt) < bestHeap.getValue(i)) {
      updateBestPointInCell(i);
    }
  }

  function updateBestPointInCell(i) {
    var distSq = findBestPointInCell(i);
    bestHeap.updateValue(i, distSq);
  }

  function findBestPointInCell_v1(i) {
    // randomly probe for the best point
    var probes = 20;
    var maxDist = 0;
    var best, p, dist;
    while (probes-- > 0) {
      p = getRandomPointInCell(i);
      dist = findDistanceFromNeighbors(maxDist, p, i);
      if (dist > maxDist) {
        maxDist = dist;
        best = p;
      }
    }
    bestPoints[i] = best;
    return maxDist;
  }

  function findBestPointInCell(idx) {
    // use a grid pattern to find the best point
    var perSide = 5;
    var maxDist = 0;
    var best, p, dist;
    for (var i=0, n=perSide*perSide; i<n; i++) {
      p = getGridPointInCell(idx, i, perSide);
      dist = findDistanceFromNeighbors(maxDist, p, idx);
      if (dist > maxDist) {
        maxDist = dist;
        best = p;
      }
    }
    bestPoints[idx] = best;
    return maxDist;
  }

  function getGridPointInCell(cellIdx, i, n) {
    var r = idxToRow(cellIdx);
    var c = idxToCol(cellIdx);
    var dx = (i % n + 0.5) / n;
    var dy = (Math.floor(i / n) + 0.5) / n;
    var x = (dx + c) / cols * w + x0;
    var y = (dy + r) / rows * h + y0;
    return [x, y];
  }

  function findDistanceFromNeighbors(memo, xy, i) {
    var dist = Infinity;
    var r = idxToRow(i);
    var c = idxToCol(i);
    dist = reduceDistance(dist, xy, c, r);
    if (dist < memo) return 0; // 10-15% speedup
    dist = reduceDistance(dist, xy, c+1, r);
    dist = reduceDistance(dist, xy, c, r+1);
    dist = reduceDistance(dist, xy, c-1, r);
    dist = reduceDistance(dist, xy, c, r-1);
    dist = reduceDistance(dist, xy, c+1, r+1);
    dist = reduceDistance(dist, xy, c+1, r-1);
    dist = reduceDistance(dist, xy, c-1, r+1);
    dist = reduceDistance(dist, xy, c-1, r-1);
    return dist;
  }

  function reduceDistance(memo, xy, c, r) {
    var i = colRowToIdx(c, r);
    if (i == -1) return memo; // off the edge
    var distSq = pointToPointsDistSq(xy, grid[i]);
    return distSq < memo ? distSq : memo;
  }

  function pointToPointsDistSq(xy, points) {
    var minDist = Infinity, dist;
    for (var i=0; i<points.length; i++) {
      dist = distSq(xy, points[i]);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }

  function distSq(a, b) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    return dx * dx + dy * dy;
  }

  function getRandomPointInCell(i) {
    var r = idxToRow(i);
    var c = idxToCol(i);
    var x = (Math.random() + c) / cols * w + x0;
    var y = (Math.random() + r) / rows * h + y0;
    var p = [x, y];
    return p;
  }

  function getRandomPoint() {
    return getRandomPointInCell(getRandomCell());
  }

  function getRandomCell() {
    return Math.floor(Math.random() * cells);
  }

  function pointIsUsable(xy) {
    var c = pointToCol(xy),
        r = pointToRow(xy);
    var collision = testCollision(xy, c, r) ||
      testCollision(xy, c+1, r) ||
      testCollision(xy, c, r+1) ||
      testCollision(xy, c-1, r) ||
      testCollision(xy, c, r-1) ||
      testCollision(xy, c+1, r+1) ||
      testCollision(xy, c-1, r+1) ||
      testCollision(xy, c-1, r-1) ||
      testCollision(xy, c+1, r-1);
    return !collision;
  }

  function testCollision(xy, c, r) {
    var i = colRowToIdx(c, r);
    if (i == -1) return false;
    var points = grid[i];
    return testPointCollision(xy, points, minDist);
  }

  function testPointCollision(xy, points, dist) {
    var d2 = dist * dist;
    for (var i=0; i<points.length; i++) {
      if (distSq(xy, points[i]) < d2) {
        return true;
      }
    }
    return false;
  }

  function pointToCol(xy) {
    var dx = xy[0] - x0;
    var c = Math.floor(dx / w * cols);
    if (c < 0) c = 0;
    if (c >= cols) c = cols-1;
    return c;
  }

  function pointToRow(xy) {
    var dy = xy[1] - y0;
    var r = Math.floor(dy / h * rows);
    if (r < 0) r = 0;
    if (r >= rows) r = rows-1;
    return r;
  }

  function colRowToIdx(c, r) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    return r * cols + c;
  }

  function pointToIdx(xy) {
    var c = pointToCol(xy);
    var r = pointToRow(xy);
    var idx = r * cols + c;
    return idx;
  }

  function idxToCol(i) {
    return i % cols;
  }

  function idxToRow(i) {
    return Math.floor(i / cols);
  }
}
