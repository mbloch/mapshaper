import geom from '../geom/mapshaper-geom';
import { testPointInPolygon } from '../geom/mapshaper-polygon-geom';
// TODO: optimize point-in-polygon tests for complex polygons and many points
// import { PathIndex } from '../paths/mapshaper-path-index';

export function placeDotsRandomly(shp, arcs, n) {
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


export function placeDotsEvenly(shp, arcs, n, opts) {
  if (n === 0) return [];
  var shpArea = geom.getPlanarShapeArea(shp, arcs);
  // TODO: also skip tiny sliver polygons?
  if (shpArea > 0 === false) return [];
  var bounds = arcs.getMultiShapeBounds(shp);
  var approxCells = Math.round(n * bounds.area() / shpArea);
  var evenness = opts.spacing >= 0 ? Math.min(opts.spacing, 1) : 1;
  var grid = new DotGrid(bounds, approxCells, evenness);
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
      grid.usePoint(p);
      return p;
    } else {
      grid.rejectPoint(p);
    }
  }
  return null;
}

function DotGrid(bounds, approxCells, evenness) {
  var grid = [];
  var x0 = bounds.xmin;
  var y0 = bounds.ymin;
  var w = bounds.width();
  var h = bounds.height();
  var cols = Math.round(Math.sqrt(approxCells * w / h));
  var rows = Math.ceil(cols * h / w); // overshoots bbox height
  var cells = cols * rows;
  var nextId = -1;
  var queuedCells = [];
  var probesBeforeRelaxation = Math.ceil(cells) / 2;
  var maxProbes = cells * 10;
  var probedPoints = 0;
  var queries = 0;
  var api = {};

  // set height to height of grid
  h = w * rows / cols;

  // Estimate of minimum distance between dots (based on a square grid)
  // 0.6 seems adequate from trial-and-error... consider adding a bit more to
  // be on the safe side. (run time increases fast)
  var minDist = w / cols * 0.6 * evenness;

  api.done = function() {
    // console.log(`queries: ${queries}, probed: ${Math.round(probedPoints / queries * 100)}%`);
  };

  api.getPoint = function() {
    var probes = 0;
    var p, id;
    queries++;
    // first, try finding a point in each grid cell
    // (for fast and even initial dot placement)
    while (++nextId < cells) {
      p = getRandomPointInCell(nextId);
      if (pointIsUsable(p)) return p;
      queuedCells.push(nextId);
      // console.log('failed', nextId)
    }
    // this gives one more chance to fill empty cells that had
    // collisions during the first pass
    // (is this worth doing? does it tend to create clumping?)
    while (queuedCells.length > 0) {
      id = queuedCells.pop();
      p = getRandomPointInCell(id);
      // console.log('retry?', pointIsUsable(p))
      if (pointIsUsable(p)) return p;
      // if (Math.random() > 0.3) queuedCells.push(id);
    }

    // random dart-throwing
    while (probes++ < maxProbes) {
      p = getRandomPoint();
      if (pointIsUsable(p)) {
        probedPoints++;
        return p;
      }
      if (probes % probesBeforeRelaxation === 0) {
        // relax min dist after a number of failed probes
        minDist *= 0.9;
      }
    }
    return null;
  };

  api.rejectPoint = function(xy) {
    addPointToCell(xy);
  };

  api.usePoint = function(xy) {
    addPointToCell(xy);
  };

  return api;

  function getRandomPointInCell(i) {
    var r = getRow(i);
    var c = getCol(i);
    var x = (Math.random() + r) / rows * w + x0;
    var y = (Math.random() + c) / cols * h + y0;
    return [x, y];
  }

  function getJitteredCoord(i, n, range, offs) {
    return (Math.random() + i) / n * range + offs;
  }

  function getRandomPoint() {
    return getRandomPointInCell(getRandomCell());
  }

  function getRandomCell() {
    return Math.floor(Math.random() * cells);
  }


  function addPointToCell(xy) {
    var i = getCellIdx(xy);
    var points = grid[i];
    if (!points) {
      points= grid[i] = [];
    }
    points.push(xy);
  }

  function getCellIdx(xy) {
    var c = getPointCol(xy);
    var r = getPointRow(xy);
    return r * cols + c;
  }

  function pointIsUsable(xy) {
    var c = getPointCol(xy),
        r = getPointRow(xy);
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
    if (c < 0 || r < 0 || c >= cols || r >= cols) return false;
    var i = r * cols + c;
    var points = grid[i];
    if (!points || !testPointCollision(xy, points, minDist)) return false;
    return true;
  }

  function testPointCollision(xy, points, dist) {
    for (var i=0; i<points.length; i++) {
      if (pointsAreTooClose(xy, points[i], dist)) {
        return true;
      }
    }
    return false;
  }

  function pointsAreTooClose(a, b, dist) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    return dx * dx + dy * dy < dist * dist;
  }

  function getPointCol(xy) {
    var x = xy[0];
    var dx = x - x0;
    var c = Math.floor(dx / w);
    return c; // todo: validate or clamp
  }

  function getPointRow(xy) {
    var y = xy[1];
    var dy = y - y0;
    var r = Math.floor(dy / h);
    return r; // todo: validate or clamp
  }

  function getCol(i) {
    return Math.floor(i % cols);
  }

  function getRow(i) {
    return Math.floor(i / cols);
  }
}

