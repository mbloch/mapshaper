import geom from '../geom/mapshaper-geom';
import { testPointInPolygon } from '../geom/mapshaper-polygon-geom';
import { error } from '../utils/mapshaper-logging';
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
  var grid = [];
  var x0 = bounds.xmin;
  var y0 = bounds.ymin;
  var w = bounds.width();
  var h = bounds.height();
  var approxCells = approxQueries * 0.8;
  var cols = Math.round(Math.sqrt(approxCells * w / h));
  var rows = Math.ceil(cols * h / w); // overshoots bbox height
  var cells = cols * rows;
  var nextId = -1;
  var bestPoints;
  var probesBeforeRelaxation = Math.ceil(Math.pow(cells, 0.8));
  var maxProbes = cells * 10;
  var queries = 0;

  // set height to height of grid
  h = w * rows / cols;

  var k = Math.pow(evenness, 0.7); // seems to make a better transition
  // Estimate of minimum distance between dots (based on a square grid)
  // 0.7 seems about right from trial-and-error...
  var minDist = w / cols * 0.7 * k;

  return {done: done, getPoint: getPoint};

  function done() {
    // TODO: check placement metrics if debugging
  }

  function getPoint() {
    queries++;
    if (evenness === 1) return getOptimalPoint();
    if (evenness === 0) return getRandomPoint();
    return getSpacedPoint();
  }

  function getOptimalPoint() {
    var p;
    // first, try to place a point in each grid cell
    // (for fast and even initial dot placement)
    while (++nextId < cells) {
      p = getRandomPointInCell(nextId);
      if (pointIsUsable(p)) {
        return usePoint(p);
      }
    }
    // assumes that the point grid has already been seeded
    return useBestPoint();
  }

  function getSpacedPoint() {
    // use dart-throwing, reject points that are within the minimum distance
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
    var points = grid[i] || (grid[i] = []);
    points.push(p);
    return p;
  }

  function useBestPoint() {
    var maxDist = 0;
    var bestId, p;
    if (!bestPoints) {
      bestPoints = initBestPoints();
    }
    for (var i=0; i<cells; i++) {
      p = bestPoints[i];
      if (p[2] > maxDist) {
        maxDist = p[2];
        bestId = i;
      }
    }
    p = bestPoints[bestId].slice(0, 2); // remove distance member
    usePoint(p); // add to grid of used points
    updateBestPoints(p, bestId); // update best point of this cell and neighbors
    return p;
  }

  function initBestPoints() {
    var bestPoints = [];
    for (var i=0; i<cells; i++) {
      bestPoints.push(findBestPointInCell(i));
    }
    return bestPoints;
  }

  function updateBestPoints(p, i) {
    var r = idxToRow(i);
    var c = idxToCol(i);
    bestPoints[i] = findBestPointInCell(i);
    updateBestPoint(p, c+1, r);
    updateBestPoint(p, c, r+1);
    updateBestPoint(p, c-1, r);
    updateBestPoint(p, c, r-1);
    updateBestPoint(p, c+1, r+1);
    updateBestPoint(p, c-1, r+1);
    updateBestPoint(p, c-1, r-1);
    updateBestPoint(p, c+1, r-1);
  }

  function updateBestPoint(addedPt, c, r) {
    var i = colRowToIdx(c, r);
    if (i == -1) return;
    var bestPt = bestPoints[i];
    // don't need to update best point if the newly added point is too far away
    // to have an effect
    if (pointToPointDistSq(addedPt, bestPt) > bestPt[2]) return;
    bestPoints[i] = findBestPointInCell(i);
  }

  function findBestPointInCell(i) {
    var probes = 30;
    var maxDist = 0;
    var best, p, dist;
    while (probes-- > 0) {
      p = getRandomPointInCell(i);
      dist = findDistanceFromNeighbors(p, i);
      if (dist > maxDist) {
        maxDist = dist;
        best = p;
      }
    }
    best.push(maxDist); // add distance as third element in the point
    return best;
  }

  function findDistanceFromNeighbors(xy, i) {
    var dist = Infinity;
    var r = idxToRow(i);
    var c = idxToCol(i);
    dist = reduceDistance(dist, xy, c, r);
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
    var distSq = pointToPointsDistSq(xy, grid[i] || []);
    return Math.min(memo, distSq);
  }

  function pointToPointsDistSq(xy, points) {
    var dist = Infinity;
    for (var i=0; i<points.length; i++) {
      dist = Math.min(dist, pointToPointDistSq(xy, points[i]));
    }
    return dist;
  }

  function pointToPointDistSq(a, b) {
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
    if (!points || !testPointCollision(xy, points, minDist)) return false;
    return true;
  }

  function testPointCollision(xy, points, dist) {
    var d2 = dist * dist;
    for (var i=0; i<points.length; i++) {
      if (pointToPointDistSq(xy, points[i]) < d2) {
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
    return Math.floor(i % cols);
  }

  function idxToRow(i) {
    return Math.floor(i / cols);
  }
}
