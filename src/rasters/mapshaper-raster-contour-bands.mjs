import { DataTable } from '../datatable/mapshaper-data-table';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { dissolvePolygonLayer2 } from '../dissolve/mapshaper-polygon-dissolve2';
import { importGeoJSON } from '../geojson/geojson-import';
import { cleanArcReferences } from '../paths/mapshaper-arc-clean';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { findAnchorPoint } from '../points/mapshaper-anchor-points';
import { buildPolygonMosaic } from '../polygons/mapshaper-polygon-mosaic';
import { getRasterValidityMask } from './mapshaper-raster-grid';

// Close the existing directed contour paths against a fixed raster/nodata
// boundary, polygonize the resulting network and dissolve its tiles by range.
// This deliberately uses the isoline tracer's conservative validity rule: a
// lattice cell is excluded when any of its four sample corners is invalid.
export function buildClosedContourDataset(contourDataset, grid, contours) {
  var domain = getContourCellDomain(grid, contours.band);
  var breaks = getClosedContourBreaks(contours.levels, contours.range);
  var boundaryDataset, dataset, contourLyr, nodes, arcInfo, mosaic;
  var tileLyr, outputLyr;
  if (breaks.length === 0 || domain.activeCount === 0) {
    return createEmptyClosedContourDataset(contourDataset.info);
  }
  boundaryDataset = importGeoJSON(getBoundaryGeoJSON(traceContourDomainRings(domain)), {});
  boundaryDataset.info = contourDataset.info;
  dataset = mergeDatasets([contourDataset, boundaryDataset]);
  contourLyr = dataset.layers[0];
  nodes = addIntersectionCuts(dataset, {no_snap: true});
  arcInfo = indexContourArcs(contourLyr);
  mosaic = buildPolygonMosaic(nodes).mosaic;
  tileLyr = createBandTileLayer(mosaic, dataset.arcs, arcInfo, domain, grid,
    contours.band, breaks);
  dataset.layers = [tileLyr];
  if (tileLyr.shapes.length === 0) {
    cleanArcReferences(dataset);
    return dataset;
  }
  outputLyr = dissolvePolygonLayer2(tileLyr, dataset, {
    fields: ['lower', 'upper'],
    quiet: true
  });
  dataset.layers = [outputLyr];
  cleanArcReferences(dataset);
  return dataset;
}

export function getClosedContourBreaks(levels, range) {
  if (!range || !isFinite(range.min) || !isFinite(range.max)) return [];
  if (range.min === range.max) return [range.min, range.max];
  return [range.min].concat(levels.filter(function(level) {
    return level > range.min && level < range.max;
  }), [range.max]);
}

export function getContourCellDomain(grid, band) {
  var W = grid.width;
  var H = grid.height;
  var cellW = W - 1;
  var cellH = H - 1;
  var samples = grid.samples;
  var bands = grid.bands;
  var valid = getRasterValidityMask(grid);
  var rowStride = W * bands;
  var active = new Uint8Array(Math.max(0, cellW * cellH));
  var activeCount = 0;
  var cx, cy, pixelId, off;
  for (cy = 0; cy < cellH; cy++) {
    for (cx = 0; cx < cellW; cx++) {
      pixelId = cy * W + cx;
      if (valid && (!valid[pixelId] || !valid[pixelId + 1] ||
          !valid[pixelId + W] || !valid[pixelId + W + 1])) continue;
      off = pixelId * bands + band;
      if (samples[off] !== samples[off] ||
          samples[off + bands] !== samples[off + bands] ||
          samples[off + rowStride] !== samples[off + rowStride] ||
          samples[off + rowStride + bands] !==
            samples[off + rowStride + bands]) continue;
      active[cy * cellW + cx] = 1;
      activeCount++;
    }
  }
  return {
    active: active,
    activeCount: activeCount,
    width: cellW,
    height: cellH,
    gridWidth: W,
    gridHeight: H,
    bbox: grid.bbox
  };
}

export function pointIsInContourDomain(x, y, domain) {
  var bbox = domain.bbox;
  var dx, dy, cx, cy;
  if (x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3] ||
      domain.width < 1 || domain.height < 1) return false;
  dx = (bbox[2] - bbox[0]) / domain.gridWidth;
  dy = (bbox[3] - bbox[1]) / domain.gridHeight;
  cx = Math.floor((x - bbox[0]) / dx - 0.5);
  cy = Math.floor((bbox[3] - y) / dy - 0.5);
  if (cx < 0) cx = 0;
  if (cy < 0) cy = 0;
  if (cx >= domain.width) cx = domain.width - 1;
  if (cy >= domain.height) cy = domain.height - 1;
  return domain.active[cy * domain.width + cx] === 1;
}

// Trace the union boundary of active contour cells. Segments are directed with
// the active domain on their right, matching Mapshaper's clockwise outer-ring
// convention. At a point-touch between diagonal components, taking the
// rightmost continuation keeps the two rings separate.
export function traceContourDomainRings(domain) {
  var W = domain.width;
  var H = domain.height;
  var segments = [];
  var outgoing = new Map();
  var rings = [];
  var cx, cy, id, segment;
  function isActive(x, y) {
    return x >= 0 && x < W && y >= 0 && y < H &&
      domain.active[y * W + x] === 1;
  }
  function nodeId(x, y) {
    return y * (W + 1) + x;
  }
  function addSegment(x1, y1, x2, y2, dir) {
    var seg = {
      from: nodeId(x1, y1),
      to: nodeId(x2, y2),
      dir: dir,
      visited: false
    };
    segments.push(seg);
    if (!outgoing.has(seg.from)) outgoing.set(seg.from, []);
    outgoing.get(seg.from).push(seg);
  }
  for (cy = 0; cy < H; cy++) {
    for (cx = 0; cx < W; cx++) {
      if (!isActive(cx, cy)) continue;
      if (!isActive(cx, cy - 1)) addSegment(cx, cy, cx + 1, cy, 0);
      if (!isActive(cx + 1, cy)) addSegment(cx + 1, cy, cx + 1, cy + 1, 1);
      if (!isActive(cx, cy + 1)) addSegment(cx + 1, cy + 1, cx, cy + 1, 2);
      if (!isActive(cx - 1, cy)) addSegment(cx, cy + 1, cx, cy, 3);
    }
  }
  for (id = 0; id < segments.length; id++) {
    segment = segments[id];
    if (!segment.visited) rings.push(followBoundary(segment, outgoing, domain));
  }
  return rings;
}

function followBoundary(first, outgoing, domain) {
  var ring = [getDomainNodeCoords(first.from, domain)];
  var current = first;
  var candidates, next;
  while (current && !current.visited) {
    current.visited = true;
    ring.push(getDomainNodeCoords(current.to, domain));
    candidates = outgoing.get(current.to) || [];
    next = chooseBoundaryContinuation(current, candidates);
    current = next;
  }
  return ring;
}

function chooseBoundaryContinuation(current, candidates) {
  var priorities = [1, 0, 3, 2];
  var i, j, candidate, turn;
  for (i = 0; i < priorities.length; i++) {
    for (j = 0; j < candidates.length; j++) {
      candidate = candidates[j];
      if (candidate.visited) continue;
      turn = (candidate.dir - current.dir + 4) % 4;
      if (turn === priorities[i]) return candidate;
    }
  }
  return null;
}

function getDomainNodeCoords(id, domain) {
  var W = domain.width;
  var xId = id % (W + 1);
  var yId = Math.floor(id / (W + 1));
  var bbox = domain.bbox;
  var dx = (bbox[2] - bbox[0]) / domain.gridWidth;
  var dy = (bbox[3] - bbox[1]) / domain.gridHeight;
  var x = xId === 0 ? bbox[0] :
    xId === W ? bbox[2] : bbox[0] + (xId + 0.5) * dx;
  var y = yId === 0 ? bbox[3] :
    yId === domain.height ? bbox[1] : bbox[3] - (yId + 0.5) * dy;
  return [x, y];
}

function getBoundaryGeoJSON(rings) {
  return {
    type: 'FeatureCollection',
    features: rings.map(function(coords) {
      return {
        type: 'Feature',
        properties: {},
        geometry: {type: 'LineString', coordinates: coords}
      };
    })
  };
}

function indexContourArcs(lyr) {
  var records = lyr.data ? lyr.data.getRecords() : [];
  var index = new Map();
  lyr.shapes.forEach(function(shape, shapeId) {
    var level = records[shapeId] && records[shapeId].value;
    if (!shape || typeof level != 'number') return;
    shape.forEach(function(path) {
      path.forEach(function(arcId) {
        var absId = arcId < 0 ? ~arcId : arcId;
        index.set(absId, {
          level: level,
          direction: arcId < 0 ? -1 : 1
        });
      });
    });
  });
  return index;
}

function createBandTileLayer(mosaic, arcs, arcInfo, domain, grid, band, breaks) {
  var shapes = [];
  var records = [];
  mosaic.forEach(function(tile) {
    var anchor = findAnchorPoint(tile, arcs, {});
    var bounds;
    if (!anchor || !pointIsInContourDomain(anchor.x, anchor.y, domain)) return;
    bounds = getTileBandBounds(tile, arcInfo, breaks, grid, band, anchor);
    if (!bounds) return;
    shapes.push(tile);
    records.push(bounds);
  });
  return {
    geometry_type: 'polygon',
    shapes: shapes,
    data: new DataTable(records)
  };
}

function getTileBandBounds(tile, arcInfo, breaks, grid, band, anchor) {
  var lower = breaks[0];
  var upper = breaks[breaks.length - 1];
  var sawLower = false;
  var sawUpper = false;
  tile.forEach(function(path) {
    path.forEach(function(arcId) {
      var absId = arcId < 0 ? ~arcId : arcId;
      var info = arcInfo.get(absId);
      var direction;
      if (!info) return;
      direction = arcId < 0 ? -1 : 1;
      // Contour paths are directed with the above-level side on their left.
      // Polygon rings keep their interior on the right, so following a contour
      // arc in its original direction means this tile is below that level.
      if (direction === info.direction) {
        if (!sawUpper || info.level < upper) upper = info.level;
        sawUpper = true;
      } else {
        if (!sawLower || info.level > lower) lower = info.level;
        sawLower = true;
      }
    });
  });
  if (areAdjacentBreaks(lower, upper, breaks)) {
    return {lower: lower, upper: upper};
  }
  return getSampleBandBounds(grid, band, anchor.x, anchor.y, breaks);
}

function areAdjacentBreaks(lower, upper, breaks) {
  var i = breaks.indexOf(lower);
  return i > -1 && i + 1 < breaks.length && breaks[i + 1] === upper;
}

function getSampleBandBounds(grid, band, x, y, breaks) {
  var bbox = grid.bbox;
  var col = Math.floor((x - bbox[0]) / (bbox[2] - bbox[0]) * grid.width);
  var row = Math.floor((bbox[3] - y) / (bbox[3] - bbox[1]) * grid.height);
  var value, i;
  if (col < 0) col = 0;
  if (row < 0) row = 0;
  if (col >= grid.width) col = grid.width - 1;
  if (row >= grid.height) row = grid.height - 1;
  value = grid.samples[(row * grid.width + col) * grid.bands + band];
  if (value !== value) return null;
  i = 0;
  while (i + 2 < breaks.length && value >= breaks[i + 1]) i++;
  return {lower: breaks[i], upper: breaks[i + 1]};
}

function createEmptyClosedContourDataset(info) {
  return {
    info: info || {},
    layers: [{
      geometry_type: 'polygon',
      shapes: [],
      data: new DataTable([])
    }]
  };
}
