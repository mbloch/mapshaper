/*
Copyright (c) 2016-2026, Vladimir Agafonkin

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

Based on mapbox/polylabel 2.1.0. Adapted for mapshaper to operate on
topological polygon shapes, use a bounded single-cell search and support
alternative centroid-aware objectives.
*/

import TinyQueue from 'tinyqueue';
import geom from '../geom/mapshaper-geom';

var BLOCK_SIZE = 32;
var DEFAULT_PRECISION = 0.01;
var DEFAULT_PRECISION_FLOOR = 1e-4;
// Hard ceiling on cell creation. Besides bounding runtime, this limits the
// priority queue to O(DEFAULT_PROBE_LIMIT) entries on pathological rings.
var DEFAULT_PROBE_LIMIT = 100000;
var DEFAULT_TOLERANCE = 0.1;
var DEFAULT_WEIGHT = 0.6;
var MAX_WEIGHT_PENALTY = 0.25;
var SQRT2 = Math.SQRT2;

// Find an inner point using one of four polylabel-based policies.
// Returns null for collapsed polygons, so callers can fall back to the legacy
// anchor-point finder.
export function findPolylabelPoint(shp, arcs, opts) {
  var polygon = buildPolygon(shp, arcs);
  if (!polygon) return null;

  opts = opts || {};
  var precision = getPrecision(polygon, opts);
  if (!(precision > 0)) return null;

  var limit = opts.probe_limit > 0 ? opts.probe_limit : DEFAULT_PROBE_LIMIT;
  var pole = findPole(polygon, precision, limit);
  if (!isUsablePoint(pole)) return null;

  var method = opts.method || 'centroid2';
  if (method == 'pole') return pole;

  var centroid = getCentroidCell(polygon);
  if (!(centroid.d > 0)) return pole;

  var tolerance = opts.tolerance;
  if (!(tolerance >= 0 && tolerance <= 1)) tolerance = DEFAULT_TOLERANCE;
  var minClearance = pole.distance * (1 - tolerance);

  if (method == 'centroid') {
    return centroid.d >= minClearance ? toResult(centroid, pole.probes) : pole;
  }
  if (method == 'centroid2') {
    if (centroid.d >= minClearance) return toResult(centroid, pole.probes);
    return findClosestAcceptablePoint(
      polygon, centroid.x, centroid.y, pole, minClearance, precision, limit
    );
  }
  if (method == 'weighted') {
    var weight = opts.weight;
    if (!(weight >= 0)) weight = DEFAULT_WEIGHT;
    return findWeightedPoint(polygon, centroid, pole, weight, precision, limit);
  }
  return null;
}

function isUsablePoint(p) {
  return p && isFinite(p.x) && isFinite(p.y) && p.distance > 0;
}

function buildPolygon(shp, arcs) {
  var outerIds = shp && geom.getMaxPath(shp, arcs);
  if (!outerIds) return null;

  var outer = pathToRing(outerIds, arcs);
  var outerArea = geom.getPlanarPathArea(outerIds, arcs);
  if (!outer || outerArea === 0) return null;

  var outerBounds = arcs.getSimpleShapeBounds(outerIds);
  var rings = [outer];
  var area = Math.abs(outerArea);
  var perimeter = getRingPerimeter(outer);

  // Mapshaper stores multipart polygons as a flat list of rings. Polylabel
  // expects one outer ring followed by its holes, so omit other outer rings.
  (shp || []).forEach(function(ids) {
    if (ids === outerIds) return;
    var ringArea = geom.getPlanarPathArea(ids, arcs);
    if (ringArea === 0 || ringArea * outerArea >= 0) return;
    var bounds = arcs.getSimpleShapeBounds(ids);
    if (!outerBounds.intersects(bounds)) return;
    var ring = pathToRing(ids, arcs);
    if (!ring || !geom.testPointInRing(ring[0][0], ring[0][1], outerIds, arcs)) {
      return;
    }
    rings.push(ring);
    area -= Math.abs(ringArea);
    perimeter += getRingPerimeter(ring);
  });

  if (!(area > 0) || !(perimeter > 0)) return null;
  return createPolygonContext(rings, outerBounds, area, perimeter);
}

function pathToRing(ids, arcs) {
  var iter = arcs.getShapeIter(ids);
  var points = [];
  var prevX, prevY;
  while (iter.hasNext()) {
    if (points.length === 0 || iter.x != prevX || iter.y != prevY) {
      points.push([iter.x, iter.y]);
      prevX = iter.x;
      prevY = iter.y;
    }
  }
  if (points.length < 3) return null;
  var a = points[0];
  var b = points[points.length - 1];
  if (a[0] != b[0] || a[1] != b[1]) points.push([a[0], a[1]]);
  return points.length > 3 ? points : null;
}

function getRingPerimeter(ring) {
  var sum = 0;
  for (var i = 1; i < ring.length; i++) {
    sum += geom.distance2D(
      ring[i - 1][0], ring[i - 1][1], ring[i][0], ring[i][1]
    );
  }
  return sum;
}

function createPolygonContext(rings, bounds, area, perimeter) {
  var pointCount = rings.reduce(function(sum, ring) {
    return sum + ring.length;
  }, 0);
  var coords = new Float64Array(pointCount * 2);
  var ringEnds = new Uint32Array(rings.length);
  var k = 0;
  rings.forEach(function(ring, i) {
    ring.forEach(function(p) {
      coords[k++] = p[0];
      coords[k++] = p[1];
    });
    ringEnds[i] = k;
  });
  return {
    area: area,
    perimeter: perimeter,
    bounds: bounds,
    coords: coords,
    ringEnds: ringEnds,
    blocks: buildBlocks(coords, ringEnds)
  };
}

function getPrecision(polygon, opts) {
  if (opts.precision > 0) return opts.precision;
  var extent = Math.max(polygon.bounds.width(), polygon.bounds.height());
  var relative = opts.precision_fraction > 0 ?
    opts.precision_fraction : DEFAULT_PRECISION;
  var floor = opts.precision_floor >= 0 ?
    opts.precision_floor : DEFAULT_PRECISION_FLOOR;
  // 2A/P is rotation-invariant and approximates a polygon's local thickness.
  return Math.max(relative * 2 * polygon.area / polygon.perimeter, floor * extent);
}

function findPole(polygon, precision, limit) {
  var queue = new TinyQueue([], compareMax);
  var centroid = getCentroidCell(polygon);
  var best = centroid.d > 0 ? centroid :
    new Cell(polygon.coords[0], polygon.coords[1], 0, polygon);
  var bounds = polygon.bounds;
  var bboxCell = new Cell(bounds.centerX(), bounds.centerY(), 0, polygon);
  if (bboxCell.d > best.d) best = bboxCell;

  var probes = 2;
  var exhausted = false;

  function addCell(x, y, h, seed) {
    // If the cell center is already too close to an edge for this cell to
    // improve the result, the distance scan can stop at that edge. A bailed
    // scan is never scored or queued because its returned distance is only a
    // threshold, not the center's actual signed distance.
    var threshold = best.d - Math.max(0, h * SQRT2 - precision);
    var cell = new Cell(x, y, h, polygon, threshold, seed);
    probes++;
    if (cell.bailed) return;
    if (cell.d > best.d) best = cell;
    if (cell.max > best.d + precision) queue.push(cell);
  }

  var h = Math.max(bounds.width(), bounds.height()) / 2;
  addCell(bounds.centerX(), bounds.centerY(), h, null);
  while (queue.length > 0) {
    if (probes + 4 > limit) {
      exhausted = true;
      break;
    }
    var cell = queue.pop();
    if (cell.max - best.d <= precision) continue;
    h = cell.h / 2;
    addCell(cell.x - h, cell.y - h, h, cell);
    addCell(cell.x + h, cell.y - h, h, cell);
    addCell(cell.x - h, cell.y + h, h, cell);
    addCell(cell.x + h, cell.y + h, h, cell);
  }
  return toResult(best, probes, exhausted);
}

// Among points whose clearance is near the maximum, find the point closest to
// the centroid. This is a constrained objective, not a general centroid bias.
function findClosestAcceptablePoint(
  polygon, centroidX, centroidY, pole, minClearance, precision, limit
) {
  var queue = new TinyQueue([], compareOffset);
  var bounds = polygon.bounds;
  var h = Math.max(bounds.width(), bounds.height()) / 2;
  var root = new Cell(bounds.centerX(), bounds.centerY(), h, polygon);
  setOffsetBounds(root, centroidX, centroidY);
  queue.push(root);

  var best = {
    x: pole.x,
    y: pole.y,
    d: pole.distance,
    offset: geom.distance2D(pole.x, pole.y, centroidX, centroidY)
  };
  var probes = pole.probes + 1;
  var exhausted = false;

  while (queue.length > 0) {
    if (probes + 4 > limit) {
      exhausted = true;
      break;
    }
    var cell = queue.pop();
    if (cell.minOffset >= best.offset || cell.max < minClearance) continue;
    if (cell.d >= minClearance && cell.offset < best.offset) {
      best = cell;
    }
    if (cell.h <= precision / 2) continue;
    h = cell.h / 2;
    [
      [cell.x - h, cell.y - h],
      [cell.x + h, cell.y - h],
      [cell.x - h, cell.y + h],
      [cell.x + h, cell.y + h]
    ].forEach(function(xy) {
      var child = new Cell(xy[0], xy[1], h, polygon);
      setOffsetBounds(child, centroidX, centroidY);
      if (child.minOffset < best.offset && child.max >= minClearance) {
        queue.push(child);
      }
    });
    probes += 4;
  }
  return toResult(best, probes, exhausted);
}

function setOffsetBounds(cell, x, y) {
  cell.offset = geom.distance2D(cell.x, cell.y, x, y);
  cell.minOffset = Math.max(0, cell.offset - cell.h * SQRT2);
}

function findWeightedPoint(polygon, centroid, pole, weight, precision, limit) {
  if (weight === 0) return pole;
  var bounds = polygon.bounds;
  var refDist = Math.max(bounds.width(), bounds.height()) / 2;
  var queue = new TinyQueue([], compareScore);
  var best = new Cell(pole.x, pole.y, 0, polygon);
  setWeightedScore(best, centroid, refDist, weight);

  var h = Math.max(bounds.width(), bounds.height()) / 2;
  var root = new Cell(bounds.centerX(), bounds.centerY(), h, polygon);
  setWeightedScore(root, centroid, refDist, weight);
  queue.push(root);
  var probes = pole.probes + 1;
  var exhausted = false;

  while (queue.length > 0) {
    if (probes + 4 > limit) {
      exhausted = true;
      break;
    }
    var cell = queue.pop();
    if (cell.score > best.score) best = cell;
    if (cell.maxScore - best.score <= precision) continue;
    h = cell.h / 2;
    [
      [cell.x - h, cell.y - h],
      [cell.x + h, cell.y - h],
      [cell.x - h, cell.y + h],
      [cell.x + h, cell.y + h]
    ].forEach(function(xy) {
      var child = new Cell(xy[0], xy[1], h, polygon);
      setWeightedScore(child, centroid, refDist, weight);
      if (child.maxScore > best.score + precision) queue.push(child);
      if (child.score > best.score) best = child;
    });
    probes += 4;
  }
  return toResult(best, probes, exhausted);
}

function setWeightedScore(cell, centroid, refDist, weight) {
  var offset = geom.distance2D(cell.x, cell.y, centroid.x, centroid.y);
  var minOffset = Math.max(0, offset - cell.h * SQRT2);
  var pointWeight = getCentroidWeight(offset, refDist, weight);
  var maxWeight = getCentroidWeight(minOffset, refDist, weight);
  cell.score = cell.d * pointWeight;
  cell.maxScore = cell.max * maxWeight;
}

function getCentroidWeight(offset, refDist, weight) {
  return refDist > 0 ?
    1 - Math.min(weight * offset / refDist, MAX_WEIGHT_PENALTY) : 1;
}

function getCentroidCell(polygon) {
  var coords = polygon.coords;
  var end = polygon.ringEnds[0];
  var area = 0;
  var x = 0;
  var y = 0;
  for (var i = 0, j = end - 2; i < end; j = i, i += 2) {
    var ax = coords[i];
    var ay = coords[i + 1];
    var bx = coords[j];
    var by = coords[j + 1];
    var f = ax * by - bx * ay;
    x += (ax + bx) * f;
    y += (ay + by) * f;
    area += f * 3;
  }
  if (area === 0) return new Cell(coords[0], coords[1], 0, polygon);
  return new Cell(x / area, y / area, 0, polygon);
}

function Cell(x, y, h, polygon, maxD, seed) {
  this.x = x;
  this.y = y;
  this.h = h;
  this.nsx1 = 0;
  this.nsy1 = 0;
  this.nsx2 = 0;
  this.nsy2 = 0;
  this.bailed = false;
  this.d = pointToPolygonDistance(
    this, polygon, maxD === undefined ? -Infinity : maxD, seed || null
  );
  this.max = this.d + h * SQRT2;
}

function pointToPolygonDistance(cell, polygon, maxD, seed) {
  var coords = polygon.coords;
  var ringEnds = polygon.ringEnds;
  var blocks = polygon.blocks;
  var x = cell.x;
  var y = cell.y;
  var inside = false;
  var minDistSq = Infinity;
  var thresholdSq = maxD > 0 ? maxD * maxD : -1;
  var stride = BLOCK_SIZE * 2;
  var blockIndex = 0;
  var ringStart = 0;

  if (seed) {
    cell.nsx1 = seed.nsx1;
    cell.nsy1 = seed.nsy1;
    cell.nsx2 = seed.nsx2;
    cell.nsy2 = seed.nsy2;
    minDistSq = getSegmentDistanceSq(
      x, y, seed.nsx1, seed.nsy1, seed.nsx2, seed.nsy2
    );
    if (minDistSq <= thresholdSq) {
      cell.bailed = true;
      return maxD;
    }
  }

  for (var r = 0; r < ringEnds.length; r++) {
    var ringEnd = ringEnds[r];
    var bx = coords[ringEnd - 2];
    var by = coords[ringEnd - 1];
    for (var start = ringStart; start < ringEnd;
      start += stride, blockIndex += 4) {
      var end = Math.min(start + stride, ringEnd);
      var xmin = blocks[blockIndex];
      var ymin = blocks[blockIndex + 1];
      var xmax = blocks[blockIndex + 2];
      var ymax = blocks[blockIndex + 3];
      var dx = x < xmin ? xmin - x : x > xmax ? x - xmax : 0;
      var dy = y < ymin ? ymin - y : y > ymax ? y - ymax : 0;
      var skipDist = dx * dx + dy * dy >= minDistSq;
      var skipCross = y < ymin || y >= ymax || x > xmax;
      if (skipDist && skipCross) {
        bx = coords[end - 2];
        by = coords[end - 1];
        continue;
      }
      for (var i = start; i < end; i += 2) {
        var ax = coords[i];
        var ay = coords[i + 1];
        if (!skipCross && (ay > y !== by > y) &&
          x < (bx - ax) * (y - ay) / (by - ay) + ax) {
          inside = !inside;
        }
        if (!skipDist) {
          var distSq = getSegmentDistanceSq(x, y, ax, ay, bx, by);
          if (distSq < minDistSq) {
            minDistSq = distSq;
            cell.nsx1 = ax;
            cell.nsy1 = ay;
            cell.nsx2 = bx;
            cell.nsy2 = by;
            if (minDistSq <= thresholdSq) {
              cell.bailed = true;
              return maxD;
            }
          }
        }
        bx = ax;
        by = ay;
      }
    }
    ringStart = ringEnd;
  }
  return minDistSq === 0 ? 0 : (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

function buildBlocks(coords, ringEnds) {
  var stride = BLOCK_SIZE * 2;
  var blockCount = 0;
  var ringStart = 0;
  for (var r = 0; r < ringEnds.length; r++) {
    blockCount += Math.ceil((ringEnds[r] - ringStart) / stride);
    ringStart = ringEnds[r];
  }
  var blocks = new Float64Array(blockCount * 4);
  var k = 0;
  ringStart = 0;
  for (r = 0; r < ringEnds.length; r++) {
    var ringEnd = ringEnds[r];
    for (var start = ringStart; start < ringEnd; start += stride) {
      var end = Math.min(start + stride, ringEnd);
      var prev = start === ringStart ? ringEnd - 2 : start - 2;
      var xmin = coords[prev];
      var ymin = coords[prev + 1];
      var xmax = xmin;
      var ymax = ymin;
      for (var i = start; i < end; i += 2) {
        var x = coords[i];
        var y = coords[i + 1];
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      }
      blocks[k++] = xmin;
      blocks[k++] = ymin;
      blocks[k++] = xmax;
      blocks[k++] = ymax;
    }
    ringStart = ringEnd;
  }
  return blocks;
}

function getSegmentDistanceSq(px, py, x, y, bx, by) {
  var dx = bx - x;
  var dy = by - y;
  if (dx !== 0 || dy !== 0) {
    var t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = bx;
      y = by;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

function toResult(cell, probes, exhausted) {
  return {
    x: cell.x,
    y: cell.y,
    distance: cell.d,
    probes: probes || 0,
    exhausted: !!exhausted
  };
}

function compareMax(a, b) {
  return b.max - a.max;
}

function compareOffset(a, b) {
  return a.minOffset - b.minOffset;
}

function compareScore(a, b) {
  return b.maxScore - a.maxScore;
}
