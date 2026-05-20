import { getProjTransform2 } from '../crs/mapshaper-projections';
import { getRasterGrid } from './mapshaper-raster-utils';
import { parseColor } from '../color/color-utils';
import { stop } from '../utils/mapshaper-logging';

var DEFAULT_MESH_INTERVAL = 32;
var DEFAULT_MAX_EDGE_FACTOR = 20;

export function projectRasterGridForward(raster, srcCRS, destCRS, optsArg) {
  var opts = optsArg || {};
  var grid = getRasterGrid(raster);
  var interval = opts.raster_mesh_interval || opts.rasterMeshInterval || DEFAULT_MESH_INTERVAL;
  var transform = getProjTransform2(srcCRS, destCRS);
  var timing = opts.timing;
  var mesh, bbox, outSize, outGrid;
  validateRasterGridForProjection(grid);
  timeStart(timing, 'mesh');
  mesh = buildProjectedRasterMesh(grid, transform, interval);
  classifyProjectedMeshCells(mesh, opts);
  timeEnd(timing, 'mesh');
  bbox = opts.output_bbox || opts.outputBbox || getProjectedMeshBBox(mesh);
  if (!bbox) stop('Unable to project raster layer');
  outSize = getOutputGridSize(grid, bbox, opts);
  outGrid = createProjectedRasterGrid(grid, raster, bbox, outSize.width, outSize.height, opts);
  timeStart(timing, 'rasterize');
  rasterizeProjectedMesh(grid, outGrid, mesh, getRasterProjectionSampleMethod(raster, opts));
  timeEnd(timing, 'rasterize');
  if (timing) {
    timing.outputWidth = outGrid.width;
    timing.outputHeight = outGrid.height;
    timing.meshVertices = mesh.vertices.length;
    timing.meshCells = mesh.cells.length;
    timing.meshSkippedCells = mesh.skippedCellCount;
  }
  return outGrid;
}

function getRasterProjectionSampleMethod(raster, opts) {
  var method = opts.resampling || opts.sample_method || opts.sampleMethod || getDefaultRasterProjectionSampleMethod(raster);
  if (method != 'nearest' && method != 'bilinear') {
    stop('Unsupported resampling method:', method);
  }
  return method;
}

function getDefaultRasterProjectionSampleMethod(raster) {
  return rasterAppearsCategorical(raster) ? 'nearest' : 'bilinear';
}

function rasterAppearsCategorical(raster) {
  var grid = getRasterGrid(raster);
  var recipe = raster && raster.view && raster.view.recipe || {};
  var derivation = raster && raster.derivation || {};
  return raster && raster.interpretation == 'categorical' ||
    grid && grid.colorModel == 'palette' ||
    recipe.type == 'palette' ||
    recipe.type == 'categorical' ||
    derivation.type == 'palette' ||
    derivation.type == 'categorical';
}

export function getProjectedRasterGridBBox(raster, srcCRS, destCRS, optsArg) {
  var opts = optsArg || {};
  var grid = getRasterGrid(raster);
  var interval = opts.raster_mesh_interval || opts.rasterMeshInterval || DEFAULT_MESH_INTERVAL;
  var transform = getProjTransform2(srcCRS, destCRS);
  var mesh, bbox;
  validateRasterGridForProjection(grid);
  mesh = buildProjectedRasterMesh(grid, transform, interval);
  classifyProjectedMeshCells(mesh, opts);
  bbox = getProjectedMeshBBox(mesh);
  return bbox;
}

export function getProjectedRasterMeshBBox(mesh, optsArg) {
  classifyProjectedMeshCells(mesh, optsArg || {});
  return getProjectedMeshBBox(mesh);
}

export function buildProjectedRasterMesh(grid, transform, interval) {
  var xs = getMeshStops(grid.width, interval);
  var ys = getMeshStops(grid.height, interval);
  var vertices = [];
  for (var y = 0; y < ys.length; y++) {
    for (var x = 0; x < xs.length; x++) {
      vertices.push(projectRasterMeshVertex(grid, xs[x], ys[y], transform));
    }
  }
  return {
    xs: xs,
    ys: ys,
    vertices: vertices
  };
}

function classifyProjectedMeshCells(mesh, opts) {
  var cols = mesh.xs.length;
  var cells = [];
  var lengths = [];
  var maxEdge, skipped;
  for (var y = 0; y < mesh.ys.length - 1; y++) {
    for (var x = 0; x < mesh.xs.length - 1; x++) {
      var cell = getMeshCell(mesh, cols, x, y);
      cell.maxEdge = getCellMaxEdge(cell);
      cells.push(cell);
      if (cell.valid) lengths.push(cell.maxEdge);
    }
  }
  maxEdge = getProjectedMeshMaxEdge(lengths, opts);
  skipped = 0;
  cells.forEach(function(cell) {
    if (!cell.valid || cell.maxEdge > maxEdge) {
      cell.valid = false;
      skipped++;
    }
  });
  if (opts.raster_component_filter || opts.rasterComponentFilter) {
    skipped += keepLargestValidCellComponent(cells, mesh.xs.length - 1, mesh.ys.length - 1);
  }
  mesh.cells = cells;
  mesh.maxEdge = maxEdge;
  mesh.skippedCellCount = skipped;
}

function keepLargestValidCellComponent(cells, cols, rows) {
  var componentIds = new Int32Array(cells.length);
  var components = [];
  var componentId = 0;
  var largestId = -1;
  var largestSize = 0;
  var skipped = 0;
  componentIds.fill(-1);
  for (var i = 0; i < cells.length; i++) {
    if (!cells[i].valid || componentIds[i] != -1) continue;
    components[componentId] = floodFillCellComponent(cells, componentIds, cols, rows, i, componentId);
    if (components[componentId].size > largestSize) {
      largestSize = components[componentId].size;
      largestId = componentId;
    }
    componentId++;
  }
  if (largestId == -1) return 0;
  cells.forEach(function(cell, i) {
    if (cell.valid && !componentShouldBeKept(components[componentIds[i]], components[largestId])) {
      cell.valid = false;
      skipped++;
    }
  });
  return skipped;
}

function floodFillCellComponent(cells, componentIds, cols, rows, start, componentId) {
  var stack = [start];
  var component = {
    size: 0,
    bbox: [Infinity, Infinity, -Infinity, -Infinity]
  };
  while (stack.length > 0) {
    var id = stack.pop();
    var x, y;
    if (!cells[id].valid || componentIds[id] != -1) continue;
    componentIds[id] = componentId;
    component.size++;
    expandComponentBBox(component, cells[id]);
    x = id % cols;
    y = Math.floor(id / cols);
    if (x > 0) stack.push(id - 1);
    if (x < cols - 1) stack.push(id + 1);
    if (y > 0) stack.push(id - cols);
    if (y < rows - 1) stack.push(id + cols);
  }
  return component;
}

function componentShouldBeKept(component, mainComponent) {
  if (component == mainComponent) return true;
  // A valid antimeridian split can create multiple disconnected source-grid
  // components whose projected bboxes overlap. Remote components are more
  // likely to be projection discontinuities that would create spiky triangles.
  return bboxesOverlap(component.bbox, mainComponent.bbox);
}

function expandComponentBBox(component, cell) {
  [cell.v00, cell.v10, cell.v01, cell.v11].forEach(function(p) {
    if (p.x < component.bbox[0]) component.bbox[0] = p.x;
    if (p.y < component.bbox[1]) component.bbox[1] = p.y;
    if (p.x > component.bbox[2]) component.bbox[2] = p.x;
    if (p.y > component.bbox[3]) component.bbox[3] = p.y;
  });
}

function bboxesOverlap(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function getMeshCell(mesh, cols, x, y) {
  var v = y * cols + x;
  var v00 = mesh.vertices[v];
  var v10 = mesh.vertices[v + 1];
  var v01 = mesh.vertices[v + cols];
  var v11 = mesh.vertices[v + cols + 1];
  return {
    v00: v00,
    v10: v10,
    v01: v01,
    v11: v11,
    valid: vertexIsValid(v00) && vertexIsValid(v10) && vertexIsValid(v01) && vertexIsValid(v11)
  };
}

function getCellMaxEdge(cell) {
  if (!cell.valid) return Infinity;
  return Math.max(
    getProjectedEdgeLength(cell.v00, cell.v10),
    getProjectedEdgeLength(cell.v10, cell.v11),
    getProjectedEdgeLength(cell.v11, cell.v01),
    getProjectedEdgeLength(cell.v01, cell.v00)
  );
}

function getProjectedEdgeLength(a, b) {
  var dx = a.x - b.x;
  var dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getProjectedMeshMaxEdge(lengths, opts) {
  var factor = opts.raster_max_edge_factor || opts.rasterMaxEdgeFactor || DEFAULT_MAX_EDGE_FACTOR;
  if (lengths.length === 0) return 0;
  lengths.sort(function(a, b) { return a - b; });
  return lengths[Math.floor(lengths.length / 2)] * factor;
}

function validateRasterGridForProjection(grid) {
  var t = grid && grid.transform;
  if (!grid || !grid.samples || !grid.bbox) stop('Raster layer is missing required projection data');
  if (t && (t[1] !== 0 || t[3] !== 0)) {
    stop('Raster reprojection does not support rotated or skewed rasters');
  }
}

function getMeshStops(size, interval) {
  var stops = [];
  var i;
  interval = Math.max(1, interval | 0);
  for (i = 0; i < size; i += interval) {
    stops.push(i);
  }
  if (stops[stops.length - 1] != size) stops.push(size);
  return stops;
}

function projectRasterMeshVertex(grid, px, py, transform) {
  var xy = rasterPixelToMapXY(grid, px, py);
  var p = transform(xy[0], xy[1]);
  return {
    sx: px,
    sy: py,
    x: p && isFinite(p[0]) ? p[0] : NaN,
    y: p && isFinite(p[1]) ? p[1] : NaN
  };
}

function rasterPixelToMapXY(grid, px, py) {
  var t = grid.transform;
  var bbox = grid.bbox;
  if (t) {
    return [
      t[0] * px + t[1] * py + t[2],
      t[3] * px + t[4] * py + t[5]
    ];
  }
  return [
    bbox[0] + px / grid.width * (bbox[2] - bbox[0]),
    bbox[3] - py / grid.height * (bbox[3] - bbox[1])
  ];
}

function getProjectedMeshBBox(mesh) {
  var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  mesh.cells.forEach(function(cell) {
    if (!cell.valid) return;
    [cell.v00, cell.v10, cell.v01, cell.v11].forEach(function(p) {
      if (p.x < xmin) xmin = p.x;
      if (p.x > xmax) xmax = p.x;
      if (p.y < ymin) ymin = p.y;
      if (p.y > ymax) ymax = p.y;
    });
  });
  return xmin < Infinity && xmax > xmin && ymax > ymin ? [xmin, ymin, xmax, ymax] : null;
}

function createProjectedRasterGrid(grid, raster, bbox, widthArg, heightArg, opts) {
  var width = widthArg || grid.width;
  var height = heightArg || grid.height;
  var bands = getOutputBandCount(grid, raster, opts);
  var samples = new grid.samples.constructor(width * height * bands);
  var coverage = new Uint8Array(width * height);
  fillProjectedRasterSamples(samples, bands, grid, raster, opts || {});
  return Object.assign({}, grid, {
    width: width,
    height: height,
    bands: bands,
    samples: samples,
    coverage: coverage,
    bbox: bbox,
    transform: [
      (bbox[2] - bbox[0]) / width,
      0,
      bbox[0],
      0,
      -(bbox[3] - bbox[1]) / height,
      bbox[3]
    ]
  });
}

function getOutputGridSize(grid, bbox, opts) {
  var width = opts.output_width || opts.outputWidth;
  var height = opts.output_height || opts.outputHeight;
  var pixels, aspect;
  if (width || height) {
    return {
      width: width || Math.max(1, Math.round(grid.width * height / grid.height)),
      height: height || Math.max(1, Math.round(grid.height * width / grid.width))
    };
  }
  pixels = grid.width * grid.height;
  aspect = (bbox[2] - bbox[0]) / (bbox[3] - bbox[1]);
  if (!isFinite(aspect) || aspect <= 0) return {width: grid.width, height: grid.height};
  width = Math.max(1, Math.round(Math.sqrt(pixels * aspect)));
  height = Math.max(1, Math.round(pixels / width));
  return {width: width, height: height};
}

function getOutputBandCount(grid, raster, opts) {
  var color = getNoDataColor(raster, opts);
  return color && color.a === 0 && grid.bands > 1 && grid.bands < 4 ? 4 : grid.bands;
}

function fillProjectedRasterSamples(samples, bands, grid, raster, opts) {
  var color = getNoDataColor(raster, opts);
  var noData = grid.nodata;
  if (color) {
    fillProjectedRasterColor(samples, bands, color);
    return;
  }
  if (noData === null || noData === undefined || !isFinite(noData)) return;
  samples.fill(noData);
}

function getNoDataColor(raster, opts) {
  var arg = opts.nodata_color || opts.nodataColor;
  var color;
  if (arg == null || arg === '') {
    return rasterAppearsCategorical(raster) ? null : {r: 255, g: 255, b: 255, a: 1};
  }
  if (String(arg).toLowerCase() == 'transparent') {
    return {r: 0, g: 0, b: 0, a: 0};
  }
  color = parseColor(arg);
  if (!color) stop('Unsupported nodata-color:', arg);
  return color;
}

function fillProjectedRasterColor(samples, bands, color) {
  var gray = Math.round(0.299 * color.r + 0.587 * color.g + 0.114 * color.b);
  var alpha = Math.round((color.a == null ? 1 : color.a) * 255);
  for (var i = 0; i < samples.length; i += bands) {
    if (bands == 1) {
      samples[i] = gray;
    } else {
      samples[i] = color.r;
      samples[i + 1] = color.g;
      samples[i + 2] = color.b;
      if (bands > 3) samples[i + 3] = alpha;
    }
  }
}

function rasterizeProjectedMesh(srcGrid, destGrid, mesh, sampleMethod) {
  mesh.cells.forEach(function(cell) {
    if (!cell.valid) return;
    rasterizeProjectedTriangle(srcGrid, destGrid, cell.v00, cell.v10, cell.v11, sampleMethod);
    rasterizeProjectedTriangle(srcGrid, destGrid, cell.v00, cell.v11, cell.v01, sampleMethod);
  });
}

function rasterizeProjectedTriangle(srcGrid, destGrid, a, b, c, sampleMethod) {
  var bbox, x0, x1, y0, y1, det, w1, w2, w3, sx, sy, ap, bp, cp;
  if (!vertexIsValid(a) || !vertexIsValid(b) || !vertexIsValid(c)) return;
  ap = vertexToDestPixel(destGrid, a);
  bp = vertexToDestPixel(destGrid, b);
  cp = vertexToDestPixel(destGrid, c);
  det = triangleDet(ap, bp, cp);
  if (det === 0) return;
  bbox = getTrianglePixelBounds(destGrid, ap, bp, cp);
  x0 = bbox[0]; y0 = bbox[1]; x1 = bbox[2]; y1 = bbox[3];
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      w1 = edgeFunction(bp, cp, x + 0.5, y + 0.5) / det;
      w2 = edgeFunction(cp, ap, x + 0.5, y + 0.5) / det;
      w3 = 1 - w1 - w2;
      if (w1 < -1e-9 || w2 < -1e-9 || w3 < -1e-9) continue;
      sx = w1 * a.sx + w2 * b.sx + w3 * c.sx;
      sy = w1 * a.sy + w2 * b.sy + w3 * c.sy;
      copyRasterSample(srcGrid, destGrid, sx, sy, x, y, sampleMethod);
    }
  }
}

function vertexToDestPixel(grid, vertex) {
  var p = mapXYToRasterPixel(grid, vertex.x, vertex.y);
  return {
    x: p[0],
    y: p[1],
    sx: vertex.sx,
    sy: vertex.sy
  };
}

function getTrianglePixelBounds(grid, p1, p2, p3) {
  return [
    clamp(Math.floor(Math.min(p1.x, p2.x, p3.x)), 0, grid.width - 1),
    clamp(Math.floor(Math.min(p1.y, p2.y, p3.y)), 0, grid.height - 1),
    clamp(Math.ceil(Math.max(p1.x, p2.x, p3.x)), 0, grid.width - 1),
    clamp(Math.ceil(Math.max(p1.y, p2.y, p3.y)), 0, grid.height - 1)
  ];
}

function mapXYToRasterPixel(grid, x, y) {
  var bbox = grid.bbox;
  return [
    (x - bbox[0]) / (bbox[2] - bbox[0]) * grid.width,
    (bbox[3] - y) / (bbox[3] - bbox[1]) * grid.height
  ];
}

function copyRasterSample(srcGrid, destGrid, sx, sy, dx, dy, sampleMethod) {
  if (sampleMethod == 'bilinear') {
    copyBilinearRasterSample(srcGrid, destGrid, sx, sy, dx, dy);
  } else {
    copyNearestRasterSample(srcGrid, destGrid, sx, sy, dx, dy);
  }
}

function copyNearestRasterSample(srcGrid, destGrid, sx, sy, dx, dy) {
  var srcX = clamp(Math.floor(sx), 0, srcGrid.width - 1);
  var srcY = clamp(Math.floor(sy), 0, srcGrid.height - 1);
  var src = (srcY * srcGrid.width + srcX) * srcGrid.bands;
  var dest = (dy * destGrid.width + dx) * destGrid.bands;
  if (!rasterSourcePixelIsCovered(srcGrid, srcX, srcY)) return;
  for (var band = 0; band < srcGrid.bands; band++) {
    destGrid.samples[dest + band] = srcGrid.samples[src + band];
  }
  if (destGrid.bands > srcGrid.bands) destGrid.samples[dest + 3] = 255;
  if (destGrid.coverage) destGrid.coverage[dy * destGrid.width + dx] = 1;
}

function copyBilinearRasterSample(srcGrid, destGrid, sx, sy, dx, dy) {
  var srcX = clamp(Math.floor(sx - 0.5), 0, srcGrid.width - 1);
  var srcY = clamp(Math.floor(sy - 0.5), 0, srcGrid.height - 1);
  var srcX2 = clamp(srcX + 1, 0, srcGrid.width - 1);
  var srcY2 = clamp(srcY + 1, 0, srcGrid.height - 1);
  var tx = clamp(sx - 0.5 - srcX, 0, 1);
  var ty = clamp(sy - 0.5 - srcY, 0, 1);
  var src00 = (srcY * srcGrid.width + srcX) * srcGrid.bands;
  var src10 = (srcY * srcGrid.width + srcX2) * srcGrid.bands;
  var src01 = (srcY2 * srcGrid.width + srcX) * srcGrid.bands;
  var src11 = (srcY2 * srcGrid.width + srcX2) * srcGrid.bands;
  var dest = (dy * destGrid.width + dx) * destGrid.bands;
  if (!srcGrid.coverage) {
    copyBilinearRasterSampleFast(srcGrid, destGrid, src00, src10, src01, src11, dest, tx, ty);
    if (destGrid.coverage) destGrid.coverage[dy * destGrid.width + dx] = 1;
    return;
  }
  if (copyBilinearRasterSampleWithCoverage(srcGrid, destGrid, srcX, srcY, srcX2, srcY2, src00, src10, src01, src11, dest, tx, ty)) {
    if (destGrid.coverage) destGrid.coverage[dy * destGrid.width + dx] = 1;
  }
}

function copyBilinearRasterSampleFast(srcGrid, destGrid, src00, src10, src01, src11, dest, tx, ty) {
  if (srcGrid.bands == 3) {
    copyBilinearRgbSample(srcGrid.samples, destGrid.samples, src00, src10, src01, src11, dest, tx, ty);
  } else if (srcGrid.bands == 4) {
    copyBilinearRgbaSample(srcGrid.samples, destGrid.samples, src00, src10, src01, src11, dest, tx, ty);
  } else {
    copyBilinearGenericSample(srcGrid.samples, destGrid.samples, srcGrid.bands, src00, src10, src01, src11, dest, tx, ty);
  }
  if (destGrid.bands > srcGrid.bands) destGrid.samples[dest + 3] = 255;
}

function copyBilinearRgbSample(src, destArr, src00, src10, src01, src11, dest, tx, ty) {
  copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, 0, tx, ty);
  copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, 1, tx, ty);
  copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, 2, tx, ty);
}

function copyBilinearRgbaSample(src, destArr, src00, src10, src01, src11, dest, tx, ty) {
  copyBilinearRgbSample(src, destArr, src00, src10, src01, src11, dest, tx, ty);
  copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, 3, tx, ty);
}

function copyBilinearGenericSample(src, destArr, bands, src00, src10, src01, src11, dest, tx, ty) {
  for (var band = 0; band < bands; band++) {
    copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, band, tx, ty);
  }
}

function copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, band, tx, ty) {
  var a = src[src00 + band] * (1 - tx) + src[src10 + band] * tx;
  var b = src[src01 + band] * (1 - tx) + src[src11 + band] * tx;
  destArr[dest + band] = Math.round(a * (1 - ty) + b * ty);
}

function copyBilinearRasterSampleWithCoverage(srcGrid, destGrid, srcX, srcY, srcX2, srcY2, src00, src10, src01, src11, dest, tx, ty) {
  var coords = [
    [srcX, srcY, src00, (1 - tx) * (1 - ty)],
    [srcX2, srcY, src10, tx * (1 - ty)],
    [srcX, srcY2, src01, (1 - tx) * ty],
    [srcX2, srcY2, src11, tx * ty]
  ];
  var total = 0;
  var val, item;
  for (var band = 0; band < srcGrid.bands; band++) {
    val = 0;
    total = 0;
    for (var i = 0; i < coords.length; i++) {
      item = coords[i];
      if (item[3] <= 0 || !rasterSourcePixelIsCovered(srcGrid, item[0], item[1])) continue;
      val += srcGrid.samples[item[2] + band] * item[3];
      total += item[3];
    }
    if (total <= 0) return false;
    destGrid.samples[dest + band] = Math.round(val / total);
  }
  if (destGrid.bands > srcGrid.bands) destGrid.samples[dest + 3] = 255;
  return true;
}

function rasterSourcePixelIsCovered(grid, x, y) {
  return !grid.coverage || grid.coverage[y * grid.width + x] > 0;
}

function timeStart(timing, name) {
  if (!timing) return;
  timing[name + 'Start'] = getTimer();
}

function timeEnd(timing, name) {
  if (!timing) return;
  timing[name + 'Ms'] = getTimer() - timing[name + 'Start'];
}

function getTimer() {
  return typeof performance != 'undefined' && performance.now ? performance.now() : Date.now();
}

function vertexIsValid(p) {
  return p && isFinite(p.x) && isFinite(p.y);
}

function triangleDet(a, b, c) {
  return edgeFunction(a, b, c.x, c.y);
}

function edgeFunction(a, b, x, y) {
  return (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
}

function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}
