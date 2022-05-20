import geom from '../geom/mapshaper-geom';
import { testPointInPolygon } from '../geom/mapshaper-polygon-geom';
import { error } from '../utils/mapshaper-logging';
import { MaxHeap } from '../simplify/mapshaper-heap';
import utils from '../utils/mapshaper-utils';
// TODO: optimize point-in-polygon tests for complex polygons and many points
// import { PathIndex } from '../paths/mapshaper-path-index';

export function placeDotsInPolygon(shp, arcs, n, opts) {
  // TODO: skip tiny sliver polygons?
  if (n === 0) return [];
  if (opts.evenness === 0) return placeDotsRandomly(shp, arcs, n);
  // TODO: if n == 1, consider using the 'inner' point of a polygon
  return placeDotsEvenly(shp, arcs, n, opts);
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

function placeDotsEvenly(shp, arcs, n, opts) {
  var evenness = opts.evenness >= 0 ? Math.min(opts.evenness, 1) : 1;
  var shpArea = geom.getPlanarShapeArea(shp, arcs);
  if (shpArea > 0 === false) return [];
  var bounds = arcs.getMultiShapeBounds(shp);
  var approxQueries = Math.round(n * bounds.area() / shpArea);
  if (opts.progressive) {
    // TODO: implement this properly
    approxQueries = Math.ceil(approxQueries / 6);
  }
  var grid = new DotGrid(bounds, approxQueries, evenness);
  var coords = [];
  for (var i=0; i<n; i++) {
    coords.push(placeDot(shp, arcs, grid));
  }
  grid.done();
  return coords;
}

function placeDot(shp, arcs, grid) {
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

// A method for placing dots in a 2D rectangular space
// evenness: varies from 0-1
//   0 is purely random
//   1 uses a hybrid approach, first creating a sparse structure of random
//      dots, then progressively filling in the spaces between dots
//   (0-1) first creates an evenish structure of dots, then places additional
//      dots using "dart-throwing" -- picking random points until a point
//      is found that exceeds a (variable) distance from any other point
//
function DotGrid(bounds, approxQueries, evenness) {
  var x0 = bounds.xmin;
  var y0 = bounds.ymin;
  var w = bounds.width();
  var h = bounds.height();
  var k =  0.5 * (evenness - 1) + 1; // k varies from 0.5 to 1
  var approxCells = approxQueries * 0.9 * k;
  var cols = Math.round(Math.sqrt(approxCells * w / h)) || 1;
  var rows = Math.ceil(cols * h / w); // overshoots bbox height
  var gridWidth = w;
  var gridHeight = w * rows / cols;
  var cells = cols * rows;
  var cellSize = gridWidth / cols;
  var cellId = -1;
  var shuffledIds;
  var grid = initGrid(cells);
  // data used by optimal method
  var bestPoints;
  var bestHeap;

  // Set the initial distance threshold between dots (based on a square grid)
  // When evenness < 1 (dart-throwing mode) the distance threshold is reduced in
  //   proportion to the value of evenness.
  // From trial and error, a 0.7 constant seems to give good results.
  var initialDotSpacing = gridWidth / cols * 0.7 * evenness;
  var dotSpacing = initialDotSpacing;

  // metrics
  var queries = 0;
  var bestCount = 0;

  this.done = done;
  this.getPoint = getPoint;

  function done() {
    // console.log( 'queries:', queries,'bestPct:', pct(bestCount, queries), "dotSpacing:", Math.round(dotSpacing));
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
    var p = getFirstFillPoint();
    if (p) return usePoint(p);

    // fill in the gaps of the initial placement, starting with the largest gap
    if (!bestPoints) {
      initBestPoints();
    }
    return useBestPoint();
  }

  // try to place a random but spaced point in each grid cell
  // (to create an initial sparse structure that gets filled in later)
  function getFirstFillPoint() {
    var p;
    if (!shuffledIds) {
      shuffledIds = utils.range(cells);
      utils.shuffle(shuffledIds);
    }
    while (++cellId < cells) {
      p = getRandomPointInCell(shuffledIds[cellId]);
      if (pointIsUsable(p)) {
        return p;
      }
    }
  }

  function getSpacedPoint() {
    // use dart-throwing, reject points that are within the minimum distance
    var probesBeforeRelaxation = Math.ceil(Math.pow(cells, 0.8));
    var maxProbes = cells * 10;
    var probes = 0;
    var p = getFirstFillPoint();
    if (p) return usePoint(p);

    while (probes++ < maxProbes) {
      p = getRandomPoint();
      if (pointIsUsable(p)) {
        return usePoint(p);
      }
      if (probes % probesBeforeRelaxation === 0) {
        // relax min dist after a number of failed probes
        dotSpacing *= 0.9;
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
    dotSpacing = bestHeap.peekValue();
    bestCount++;
    return p;
  }

  function initBestPoints() {
    var values = [];
    bestPoints = [];
    for (var i=0; i<cells; i++) {
      values.push(findBestPointInCell(i));
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
    var dist = bestHeap.getValue(i);
    // don't need to update best point if the newly added point is too far away
    // to have an effect.
    // (about 80% of updates are skipped, typically)
    if (distSq(addedPt, bestPt) < dist * dist) {
      updateBestPointInCell(i);
    }
  }

  function updateBestPointInCell(i) {
    var dist = findBestPointInCell(i);
    bestHeap.updateValue(i, dist);
  }

  // simpler, less performant -- for debugging
  function findBestPointInCell2(idx) {
    var r = idxToRow(idx);
    var c = idxToCol(idx);
    var perSide = 4;
    var maxDist = 0;
    var dist, p, bestPoint;
    for (var i=0; i<perSide; i++) {
      for (var j=0; j<perSide; j++) {
        p = getGridPointInCell(c, r, i, j, perSide);
        dist = findDistanceFromNearbyFeatures(maxDist, p, c, r);
        if (dist > maxDist) {
          maxDist = dist;
          bestPoint = p;
        }
      }
    }
    bestPoints[idx] = bestPoint;
    return maxDist;
  }

  function findBestPointInCell(idx) {
    // Find a point by finding the best-placed center point in a grid of sub-cells,
    // then recursively dividing the winning sub-cell
    var r = idxToRow(idx);
    var c = idxToCol(idx);
    var p = findBestPointInSubCell(c, r, 0, 0, 1);
    bestPoints[idx] = p;
    return p.pop();
  }

  // c, r: location of parent cell in the grid
  // c1, r1: index of sub-cell at the given z-value
  // z: depth of recursive subdivision
  function findBestPointInSubCell(c, r, c1, r1, z) {
    // using a 3x3 grid instead of 2x2 ... testing showed that 2x2 was more
    // likely to misidentify the sub-cell with the optimal point
    var q = 3;
    var perSide = Math.pow(q, z); // number of cell divisions per axis at this z
    var maxDist = 0;
    var c2, r2, p, best, dist;
    for (var i=0; i<q; i++) {
      for (var j=0; j<q; j++) {
        p = getGridPointInCell(c, r, c1 + i, r1 + j, perSide);
        dist = findDistanceFromNearbyFeatures(maxDist, p, c, r);
        if (dist > maxDist) {
          maxDist = dist;
          best = p;
          c2 = i;
          r2 = j;
        }
      }
    }
    if (z == 2) { // stop subdividing the cell at this level
      best.push(maxDist); // return distance as third element
      return best;
    } else {
      return findBestPointInSubCell(c, r, (c1 + c2)*q, (r1 + r2)*q, z + 1);
    }
  }

  function getGridPointInCell(c, r, c2, r2, n) {
    var dx = (c2 + 0.5) / n;
    var dy = (r2 + 0.5) / n;
    var x = (dx + c) / cols * w + x0;
    var y = (dy + r) / rows * h + y0;
    return [x, y];
  }

  // col, row offsets of a cell and its 8 neighbors
  // (ordered to reject unsuitable points faster)
  var nabes = [
    [0, 0], [0, -1], [-1, 0], [1, 0], [0, 1],
    [-1, 1], [1, -1], [-1, -1], [1, 1]
  ];

  function findDistanceFromNearbyFeatures(memo, xy, c, r) {
    var minDistSq = Infinity;
    var offs, c2, r2, distSq, dist;
    for (var i=0; i<9; i++) {
      offs = nabes[i];
      c2 = offs[0];
      r2 = offs[1];
      distSq = distSqFromPointsInCell(xy, c + c2, r + r2);
      if (distSq < memo * memo) {
        // short-circuit rejection of this point (optimization)
        // -- it is closer than a previously tested point
        return 0;
      }
      if (distSq < minDistSq) {
        minDistSq = distSq;
      }
    }
    dist = Math.sqrt(minDistSq);
    // maintain distance from grid edge
    // (this prevents two sets of dots from appearing right along the edges of
    // rectangular polygons).
    dist = Math.min(dist, spaceFromEdge(xy, c, r));
    return dist;
  }

  function spaceFromEdge(xy, c, r) {
    // ignore edges if cell is internal to the grid
    if (c > 0 && r > 0 && c < cols-1 && r < rows-1) return Infinity;
    var x = xy[0], y = xy[1];
    // exaggerating the true distance to prevent a visible gutter from appearing
    // along the borders of shapes with rectangular edges.
    return Math.min(x - x0, x0 + w - x, y - y0, y0 + h - y) * 3;
  }

  function distSqFromPointsInCell(xy, c, r) {
    var minDist = Infinity, dist;
    var idx = colRowToIdx(c, r);
    var points = idx > -1 ? grid[idx] : []; // off the edge
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
      testEdgeCollision(xy, c, r) ||
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

  function testEdgeCollision(xy, c, r) {
    return spaceFromEdge(xy, c, r) < dotSpacing;
  }

  function testCollision(xy, c, r) {
    var i = colRowToIdx(c, r);
    if (i == -1) return false;
    var points = grid[i];
    return testPointCollision(xy, points, dotSpacing);
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
