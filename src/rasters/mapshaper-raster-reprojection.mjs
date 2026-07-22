import {
  getProjTransform2,
  isLatLngCRS,
  parseCrsString
} from '../crs/mapshaper-projections';
import { getProjectionTopology } from '../crs/mapshaper-projection-topology';
import { getRasterGrid } from './mapshaper-raster-utils';
import { parseColor } from '../color/color-utils';
import { stop } from '../utils/mapshaper-logging';

var DEFAULT_MESH_INTERVAL = 32;
var DEFAULT_MAX_EDGE_FACTOR = 20;
var DEFAULT_TOPOLOGY_MIN_CELL_SIZE = 0.5;
var MAX_TOPOLOGY_SUBDIVISION_DEPTH = 12;
var TOPOLOGY_SAMPLE_STEPS = 4;
var TOPOLOGY_VERTEX_INSET = 1e-7;
var PIECE_SAMPLE_STEPS = 4;
var EXPANDED_FACET_MAX_EDGE_DEGREES = 2;
var EXPANDED_FACET_MAX_CLIP_ERROR = 0.02;

export function projectRasterGridForward(raster, srcCRS, destCRS, optsArg) {
  var opts = optsArg || {};
  var grid = getRasterGrid(raster);
  var interval = opts.raster_mesh_interval || opts.rasterMeshInterval || DEFAULT_MESH_INTERVAL;
  var transform = getProjTransform2(srcCRS, destCRS);
  var timing = opts.timing;
  var mesh, bbox, outSize, outGrid;
  validateRasterGridForProjection(grid);
  timeStart(timing, 'mesh');
  mesh = buildRasterProjectionMesh(grid, srcCRS, destCRS, transform, interval, opts);
  classifyRasterMesh(mesh, opts);
  timeEnd(timing, 'mesh');
  bbox = opts.output_bbox || opts.outputBbox || getProjectedMeshBBox(mesh);
  if (!bbox) stop('Unable to project raster layer');
  outSize = getOutputGridSize(grid, bbox, opts);
  outGrid = createProjectedRasterGrid(grid, raster, bbox, outSize.width, outSize.height, opts);
  timeStart(timing, 'rasterize');
  rasterizeProjectedMesh(grid, outGrid, mesh, getRasterProjectionSampleMethod(raster, opts));
  if (mesh.fillOutputCoverage) {
    fillProjectedRasterCoverage(outGrid);
  } else {
    fillIsolatedProjectedRasterHoles(outGrid);
  }
  timeEnd(timing, 'rasterize');
  if (timing) {
    timing.outputWidth = outGrid.width;
    timing.outputHeight = outGrid.height;
    timing.meshVertices = mesh.vertices.length;
    timing.meshCells = mesh.triangles ? mesh.triangles.length : mesh.cells.length;
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
  mesh = buildRasterProjectionMesh(grid, srcCRS, destCRS, transform, interval, opts);
  classifyRasterMesh(mesh, opts);
  bbox = getProjectedMeshBBox(mesh);
  return bbox;
}

export function getProjectedRasterMeshBBox(mesh, optsArg) {
  classifyRasterMesh(mesh, optsArg || {});
  return getProjectedMeshBBox(mesh);
}

function buildRasterProjectionMesh(grid, srcCRS, destCRS, transform, interval, opts) {
  var topology = getProjectionTopology(destCRS);
  if (topology && (topology.raster_source_regions ||
      topology.raster_spherical_regions)) {
    return buildExpandedFacetRasterMesh(
      grid, srcCRS, destCRS, interval, topology);
  }
  if (topology && (topology.projectRasterRegion ||
      topology.projectRegion || topology.constrainRegionPoint)) {
    return buildPiecewiseProjectedRasterMesh(grid, srcCRS, destCRS, interval, topology);
  }
  if (topology && (topology.findTransitionRegion || topology.findRegion)) {
    return buildTopologyAwareProjectedRasterMesh(grid, srcCRS, destCRS, interval, opts);
  }
  return buildProjectedRasterMesh(grid, transform, interval);
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

function buildPiecewiseProjectedRasterMesh(grid, srcCRS, destCRS, interval, topology) {
  var wgs84 = parseCrsString('wgs84');
  var toGeographic = getProjTransform2(srcCRS, wgs84);
  var fromGeographic = getProjTransform2(wgs84, srcCRS);
  var toDestination = getProjTransform2(wgs84, destCRS);
  interval = Math.min(interval, topology.raster_mesh_interval || interval);
  var xs = getMeshStops(grid.width, interval);
  var ys = getMeshStops(grid.height, interval);
  var regions = topology.raster_regions || topology.regions;
  var mesh = {
    xs: xs,
    ys: ys,
    vertices: [],
    cells: [],
    topologyAware: true,
    subdivisionSkippedCellCount: 0,
    fillRegionMask: topology.fill_raster_mask,
    fillOutputCoverage: topology.fill_raster_coverage,
    projectedRegions: getProjectedRasterRegions(
      topology, regions, destCRS, toDestination)
  };
  var context = {
    grid: grid,
    topology: topology,
    destCRS: destCRS,
    toGeographic: toGeographic,
    fromGeographic: fromGeographic,
    toDestination: toDestination,
    findRegion: topology.findRasterRegion || topology.findRegion,
    projectRegion: topology.projectRasterRegion || topology.projectRegion,
    pieceHalo: topology.raster_cell_halo === false ? 0 : interval,
    mesh: mesh
  };
  for (var y = 0; y < ys.length - 1; y++) {
    for (var x = 0; x < xs.length - 1; x++) {
      appendPiecewiseMeshCells(context, xs[x], ys[y], xs[x + 1], ys[y + 1]);
    }
  }
  return mesh;
}

function buildExpandedFacetRasterMesh(grid, srcCRS, destCRS, interval, topology) {
  var wgs84 = parseCrsString('wgs84');
  var fromGeographic = getProjTransform2(wgs84, srcCRS);
  var regions = topology.raster_regions;
  var mesh = {
    vertices: [],
    cells: [],
    triangles: [],
    topologyAware: true,
    subdivisionSkippedCellCount: 0,
    fillRegionMask: topology.fill_raster_mask,
    fillOutputCoverage: topology.fill_raster_coverage,
    projectedRegions: getProjectedRasterRegions(
      topology, regions, destCRS, getProjTransform2(wgs84, destCRS)),
    sourceWrapX: isLatLngCRS(srcCRS) &&
      Math.abs(grid.bbox[2] - grid.bbox[0] - 360) < 1e-3
  };
  var sourceRegions = topology.raster_source_regions ||
    topology.raster_spherical_regions;
  var piecesBySourceRegion = new Map();
  regions.forEach(function(region) {
    var key = getRasterSourceRegionKey(region);
    var pieces = piecesBySourceRegion.get(key) || [];
    pieces.push(region);
    piecesBySourceRegion.set(key, pieces);
  });
  var context = {
    grid: grid,
    topology: topology,
    destCRS: destCRS,
    fromGeographic: fromGeographic,
    mesh: mesh
  };
  sourceRegions.forEach(function(region) {
    var boundary = region.boundary;
    var pieces = piecesBySourceRegion.get(getRasterSourceRegionKey(region));
    var triangles = [];
    var end = pointsEqual2D(boundary[0], boundary[boundary.length - 1]) ?
      boundary.length - 1 : boundary.length;
    for (var i = 1; i < end - 1; i++) {
      triangles.push([boundary[0], boundary[i], boundary[i + 1]]);
    }
    triangles.forEach(function(triangle) {
      var depth = getSphericalTriangleSubdivisionDepth(
        triangle, EXPANDED_FACET_MAX_EDGE_DEGREES);
      subdivideSphericalRasterTriangle(
        context, triangle, region, pieces, depth);
    });
  });
  return mesh;
}

function getRasterSourceRegionKey(region) {
  if (region.source_region != null) return String(region.source_region);
  if (region.facet != null && region.sector != null) {
    return region.facet + ':' + region.sector;
  }
  return String(region.id);
}

function pointsEqual2D(a, b) {
  return a && b && Math.abs(a[0] - b[0]) < 1e-10 &&
    Math.abs(a[1] - b[1]) < 1e-10;
}

function getSphericalTriangleSubdivisionDepth(triangle, maxDegrees) {
  var max = Math.max(
    sphericalPointDistance(triangle[0], triangle[1]),
    sphericalPointDistance(triangle[1], triangle[2]),
    sphericalPointDistance(triangle[2], triangle[0])
  );
  return Math.max(0, Math.ceil(Math.log(max / maxDegrees) / Math.LN2));
}

function subdivideSphericalRasterTriangle(context, triangle, region, pieces, depth) {
  if (depth > 0) {
    var ab = sphericalPointMidpoint(triangle[0], triangle[1]);
    var bc = sphericalPointMidpoint(triangle[1], triangle[2]);
    var ca = sphericalPointMidpoint(triangle[2], triangle[0]);
    subdivideSphericalRasterTriangle(
      context, [triangle[0], ab, ca], region, pieces, depth - 1);
    subdivideSphericalRasterTriangle(
      context, [ab, triangle[1], bc], region, pieces, depth - 1);
    subdivideSphericalRasterTriangle(
      context, [ca, bc, triangle[2]], region, pieces, depth - 1);
    subdivideSphericalRasterTriangle(
      context, [ab, bc, ca], region, pieces, depth - 1);
    return;
  }
  var rawVertices = triangle.map(function(lonlat) {
    return projectSphericalRawVertex(context, lonlat, region);
  });
  normalizeWrappedTrianglePixels(
    rawVertices, context.grid.width, context.mesh.sourceWrapX);
  pieces.forEach(function(piece) {
    var polygon = context.topology.clipRasterRegionPolygon(
      rawVertices, piece.id);
    if (!rasterPiecePolygonIsAccurate(
      context.topology, polygon, piece.id)) return;
    polygon.forEach(function(vertex) {
      var p = scaleRawProjectionPoint(
        context.destCRS, [vertex.x, vertex.y]);
      vertex.x = p[0];
      vertex.y = p[1];
    });
    for (var i = 1; i < polygon.length - 1; i++) {
      var vertices = [polygon[0], polygon[i], polygon[i + 1]];
      context.mesh.vertices.push(vertices[0], vertices[1], vertices[2]);
      context.mesh.triangles.push({
        a: vertices[0],
        b: vertices[1],
        c: vertices[2],
        region: piece.id,
        valid: vertices.every(vertexIsValid)
      });
    }
  });
}

function projectSphericalRawVertex(context, lonlat, region) {
  var sourceXY = context.fromGeographic(lonlat[0], lonlat[1]);
  var sourcePixel = sourceXY &&
    rasterMapXYToPixel(context.grid, sourceXY[0], sourceXY[1]);
  var p = context.topology.projectRasterSourceRegion ?
    context.topology.projectRasterSourceRegion(
      lonlat[0], lonlat[1], region.id) :
    context.topology.projectRasterSector(
      lonlat[0], lonlat[1], region.facet, region.sector);
  return {
    sx: sourcePixel ? sourcePixel[0] : NaN,
    sy: sourcePixel ? sourcePixel[1] : NaN,
    x: p && isFinite(p[0]) ? p[0] : NaN,
    y: p && isFinite(p[1]) ? p[1] : NaN,
    lon: lonlat[0],
    lat: lonlat[1]
  };
}

function rasterPiecePolygonIsAccurate(topology, polygon, regionId) {
  // A triangle that crosses a forced sector discontinuity can yield invalid
  // interpolated clip vertices. Adjacent triangles cover the rejected sliver.
  return polygon.every(function(vertex) {
    var p = topology.projectRasterRegion(
      vertex.lon, vertex.lat, regionId);
    return p && Math.hypot(vertex.x - p[0], vertex.y - p[1]) <
      EXPANDED_FACET_MAX_CLIP_ERROR;
  });
}

function normalizeWrappedTrianglePixels(vertices, width, wrap) {
  if (!wrap) return;
  var xmin = Math.min(vertices[0].sx, vertices[1].sx, vertices[2].sx);
  var xmax = Math.max(vertices[0].sx, vertices[1].sx, vertices[2].sx);
  if (xmax - xmin <= width / 2) return;
  vertices.forEach(function(vertex) {
    if (vertex.sx < width / 2) vertex.sx += width;
  });
}

function sphericalPointMidpoint(a, b) {
  var av = lonLatToVector(a);
  var bv = lonLatToVector(b);
  return vectorToLonLat(normalizeVector3([
    av[0] + bv[0],
    av[1] + bv[1],
    av[2] + bv[2]
  ]));
}

function sphericalPointDistance(a, b) {
  var av = lonLatToVector(a);
  var bv = lonLatToVector(b);
  return Math.acos(clamp(
    av[0] * bv[0] + av[1] * bv[1] + av[2] * bv[2], -1, 1
  )) * 180 / Math.PI;
}

function lonLatToVector(p) {
  var lam = p[0] * Math.PI / 180;
  var phi = p[1] * Math.PI / 180;
  var cosPhi = Math.cos(phi);
  return [Math.cos(lam) * cosPhi, Math.sin(lam) * cosPhi, Math.sin(phi)];
}

function vectorToLonLat(p) {
  return [
    Math.atan2(p[1], p[0]) * 180 / Math.PI,
    Math.asin(clamp(p[2], -1, 1)) * 180 / Math.PI
  ];
}

function normalizeVector3(p) {
  var k = 1 / Math.hypot(p[0], p[1], p[2]);
  return [p[0] * k, p[1] * k, p[2] * k];
}

function appendPiecewiseMeshCells(context, x0, y0, x1, y1) {
  getPieceRegionsInCell(context, x0, y0, x1, y1).forEach(function(regionId) {
    var v00 = projectPiecewiseMeshVertex(context, x0, y0, regionId);
    var v10 = projectPiecewiseMeshVertex(context, x1, y0, regionId);
    var v01 = projectPiecewiseMeshVertex(context, x0, y1, regionId);
    var v11 = projectPiecewiseMeshVertex(context, x1, y1, regionId);
    var cell = {
      v00: v00,
      v10: v10,
      v01: v01,
      v11: v11,
      region: regionId,
      valid: vertexIsValid(v00) && vertexIsValid(v10) &&
        vertexIsValid(v01) && vertexIsValid(v11)
    };
    context.mesh.vertices.push(v00, v10, v01, v11);
    context.mesh.cells.push(cell);
  });
}

function getPieceRegionsInCell(context, x0, y0, x1, y1) {
  var ids = [];
  var halo = context.pieceHalo;
  samplePieceRegions(context, ids, x0, y0, x1, y1);
  if (halo > 0) {
    samplePieceRegions(
      context,
      ids,
      Math.max(0, x0 - halo),
      Math.max(0, y0 - halo),
      Math.min(context.grid.width, x1 + halo),
      Math.min(context.grid.height, y1 + halo)
    );
  }
  return ids;
}

function samplePieceRegions(context, ids, x0, y0, x1, y1) {
  for (var iy = 0; iy <= PIECE_SAMPLE_STEPS; iy++) {
    for (var ix = 0; ix <= PIECE_SAMPLE_STEPS; ix++) {
      var px = x0 + (x1 - x0) * ix / PIECE_SAMPLE_STEPS;
      var py = y0 + (y1 - y0) * iy / PIECE_SAMPLE_STEPS;
      var xy = rasterPixelToMapXY(context.grid, px, py);
      var lonlat = context.toGeographic(xy[0], xy[1]);
      var id = lonlat && context.findRegion(lonlat[0], lonlat[1]);
      if (id != null && id !== -1 && ids.indexOf(id) == -1) ids.push(id);
    }
  }
}

function projectPiecewiseMeshVertex(context, px, py, regionId) {
  var xy = rasterPixelToMapXY(context.grid, px, py);
  var lonlat = context.toGeographic(xy[0], xy[1]);
  var p, sourcePixel;
  if (!lonlat) return {sx: px, sy: py, x: NaN, y: NaN};
  if (context.projectRegion) {
    p = context.projectRegion(lonlat[0], lonlat[1], regionId);
    p = scaleRawProjectionPoint(context.destCRS, p);
    sourcePixel = [px, py];
  } else {
    lonlat = context.topology.constrainRegionPoint(lonlat[0], lonlat[1], regionId);
    xy = lonlat && context.fromGeographic(lonlat[0], lonlat[1]);
    p = lonlat && context.toDestination(lonlat[0], lonlat[1]);
    sourcePixel = xy && rasterMapXYToPixel(context.grid, xy[0], xy[1]);
  }
  return {
    sx: sourcePixel ? sourcePixel[0] : px,
    sy: sourcePixel ? sourcePixel[1] : py,
    x: p && isFinite(p[0]) ? p[0] : NaN,
    y: p && isFinite(p[1]) ? p[1] : NaN
  };
}

function getProjectedRasterRegions(topology, regions, destCRS, toDestination) {
  return regions.map(function(region) {
    var boundary;
    if (region.projected_boundary) {
      boundary = region.projected_boundary.map(function(p) {
        return scaleRawProjectionPoint(destCRS, p);
      });
    } else {
      boundary = topology.getRegionBoundary(region.id).map(function(p) {
        var q = topology.constrainRegionPoint(p[0], p[1], region.id);
        return toDestination(q[0], q[1]);
      });
    }
    return {
      id: region.id,
      boundary: boundary
    };
  });
}

function scaleRawProjectionPoint(P, p) {
  if (!p) return null;
  return [
    P.fr_meter * (P.a * p[0] + P.x0),
    P.fr_meter * (P.a * p[1] + P.y0)
  ];
}

export function buildTopologyAwareProjectedRasterMesh(grid, srcCRS, destCRS, interval, optsArg) {
  var opts = optsArg || {};
  var topology = getProjectionTopology(destCRS);
  var findRegion = topology && (topology.findTransitionRegion || topology.findRegion);
  var wgs84 = parseCrsString('wgs84');
  var toGeographic = getProjTransform2(srcCRS, wgs84);
  var toDestination = getProjTransform2(wgs84, destCRS);
  var xs = getMeshStops(grid.width, interval);
  var ys = getMeshStops(grid.height, interval);
  var minCellSize = opts.raster_topology_min_cell_size ||
    opts.rasterTopologyMinCellSize ||
    DEFAULT_TOPOLOGY_MIN_CELL_SIZE;
  var mesh = {
    xs: xs,
    ys: ys,
    vertices: [],
    cells: [],
    topologyAware: true,
    subdivisionSkippedCellCount: 0
  };
  var context = {
    grid: grid,
    findRegion: findRegion,
    toGeographic: toGeographic,
    toDestination: toDestination,
    minCellSize: Math.max(0.01, minCellSize),
    maxDepth: MAX_TOPOLOGY_SUBDIVISION_DEPTH,
    mesh: mesh
  };
  if (!findRegion) return buildProjectedRasterMesh(grid, getProjTransform2(srcCRS, destCRS), interval);
  for (var y = 0; y < ys.length - 1; y++) {
    for (var x = 0; x < xs.length - 1; x++) {
      addTopologyMeshCell(context, xs[x], ys[y], xs[x + 1], ys[y + 1], 0);
    }
  }
  return mesh;
}

function addTopologyMeshCell(context, x0, y0, x1, y1, depth) {
  var classification = classifyTopologyCell(context, x0, y0, x1, y1);
  var width = x1 - x0;
  var height = y1 - y0;
  var splitX = width > context.minCellSize && depth < context.maxDepth;
  var splitY = height > context.minCellSize && depth < context.maxDepth;
  if (classification.mixed && (splitX || splitY)) {
    subdivideTopologyMeshCell(context, x0, y0, x1, y1, depth, splitX, splitY);
    return;
  }
  if (classification.region == null || classification.mixed) {
    context.mesh.subdivisionSkippedCellCount++;
    return;
  }
  appendTopologyMeshCell(context, x0, y0, x1, y1, classification.region);
}

function subdivideTopologyMeshCell(context, x0, y0, x1, y1, depth, splitX, splitY) {
  var xm = splitX ? (x0 + x1) / 2 : x1;
  var ym = splitY ? (y0 + y1) / 2 : y1;
  addTopologyMeshCell(context, x0, y0, xm, ym, depth + 1);
  if (splitX) addTopologyMeshCell(context, xm, y0, x1, ym, depth + 1);
  if (splitY) addTopologyMeshCell(context, x0, ym, xm, y1, depth + 1);
  if (splitX && splitY) addTopologyMeshCell(context, xm, ym, x1, y1, depth + 1);
}

function classifyTopologyCell(context, x0, y0, x1, y1) {
  var cx = (x0 + x1) / 2;
  var cy = (y0 + y1) / 2;
  var region = getTopologyRegionAtPixel(context, cx, cy);
  var mixed = false;
  for (var iy = 0; iy <= TOPOLOGY_SAMPLE_STEPS && !mixed; iy++) {
    for (var ix = 0; ix <= TOPOLOGY_SAMPLE_STEPS; ix++) {
      var px = x0 + (x1 - x0) * ix / TOPOLOGY_SAMPLE_STEPS;
      var py = y0 + (y1 - y0) * iy / TOPOLOGY_SAMPLE_STEPS;
      px += (cx - px) * TOPOLOGY_VERTEX_INSET;
      py += (cy - py) * TOPOLOGY_VERTEX_INSET;
      if (getTopologyRegionAtPixel(context, px, py) !== region) {
        mixed = true;
        break;
      }
    }
  }
  return {region: region, mixed: mixed};
}

function getTopologyRegionAtPixel(context, px, py) {
  var xy = rasterPixelToMapXY(context.grid, px, py);
  var lonlat = context.toGeographic(xy[0], xy[1]);
  if (!lonlat) return null;
  return context.findRegion(lonlat[0], lonlat[1]);
}

function appendTopologyMeshCell(context, x0, y0, x1, y1, region) {
  var cx = (x0 + x1) / 2;
  var cy = (y0 + y1) / 2;
  var v00 = projectTopologyMeshVertex(context, x0, y0, cx, cy);
  var v10 = projectTopologyMeshVertex(context, x1, y0, cx, cy);
  var v01 = projectTopologyMeshVertex(context, x0, y1, cx, cy);
  var v11 = projectTopologyMeshVertex(context, x1, y1, cx, cy);
  var cell = {
    v00: v00,
    v10: v10,
    v01: v01,
    v11: v11,
    region: region,
    valid: vertexIsValid(v00) && vertexIsValid(v10) &&
      vertexIsValid(v01) && vertexIsValid(v11)
  };
  context.mesh.vertices.push(v00, v10, v01, v11);
  context.mesh.cells.push(cell);
}

function projectTopologyMeshVertex(context, px, py, cx, cy) {
  var insetX = px + (cx - px) * TOPOLOGY_VERTEX_INSET;
  var insetY = py + (cy - py) * TOPOLOGY_VERTEX_INSET;
  var xy = rasterPixelToMapXY(context.grid, insetX, insetY);
  var lonlat = context.toGeographic(xy[0], xy[1]);
  var p = lonlat && context.toDestination(lonlat[0], lonlat[1]);
  return {
    sx: px,
    sy: py,
    x: p && isFinite(p[0]) ? p[0] : NaN,
    y: p && isFinite(p[1]) ? p[1] : NaN
  };
}

function classifyRasterMesh(mesh, opts) {
  if (mesh.topologyAware) {
    classifyTopologyMeshCells(mesh);
  } else {
    classifyProjectedMeshCells(mesh, opts);
  }
}

function classifyTopologyMeshCells(mesh) {
  var filtered = 0;
  mesh.cells.forEach(function(cell) {
    cell.maxEdge = getCellMaxEdge(cell);
    if (!cell.valid) {
      cell.valid = false;
      filtered++;
    }
  });
  // Topology-aware cells never span projection branches. Do not apply the
  // regular mesh's median-edge outlier filter here: adaptive subdivision
  // creates many small boundary cells that would make valid interior cells
  // appear to be outliers.
  mesh.maxEdge = Infinity;
  mesh.skippedCellCount = mesh.subdivisionSkippedCellCount + filtered;
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

function rasterMapXYToPixel(grid, x, y) {
  var t = grid.transform;
  if (t) {
    return [
      (x - t[2]) / t[0],
      (y - t[5]) / t[4]
    ];
  }
  return [
    (x - grid.bbox[0]) / (grid.bbox[2] - grid.bbox[0]) * grid.width,
    (grid.bbox[3] - y) / (grid.bbox[3] - grid.bbox[1]) * grid.height
  ];
}

function getProjectedMeshBBox(mesh) {
  var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  if (mesh.projectedRegions) {
    mesh.projectedRegions.forEach(function(region) {
      region.boundary.forEach(expand);
    });
  } else {
    mesh.cells.forEach(function(cell) {
      if (!cell.valid) return;
      [cell.v00, cell.v10, cell.v01, cell.v11].forEach(expand);
    });
  }
  function expand(p) {
    if (!p) return;
    var x = Array.isArray(p) ? p[0] : p.x;
    var y = Array.isArray(p) ? p[1] : p.y;
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
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
  var regionData = mesh.projectedRegions ?
    createProjectedRegionMask(
      destGrid, mesh.projectedRegions, mesh.fillRegionMask) :
    null;
  (mesh.triangles || []).forEach(function(triangle) {
    if (!triangle.valid) return;
    var regionValue = regionData && regionData.values.get(triangle.region);
    rasterizeProjectedTriangle(
      srcGrid, destGrid, triangle.a, triangle.b, triangle.c,
      sampleMethod, regionData && regionData.mask, regionValue,
      mesh.sourceWrapX
    );
  });
  mesh.cells.forEach(function(cell) {
    if (!cell.valid) return;
    var regionValue = regionData && regionData.values.get(cell.region);
    rasterizeProjectedTriangle(
      srcGrid, destGrid, cell.v00, cell.v10, cell.v11,
      sampleMethod, regionData && regionData.mask, regionValue, false
    );
    rasterizeProjectedTriangle(
      srcGrid, destGrid, cell.v00, cell.v11, cell.v01,
      sampleMethod, regionData && regionData.mask, regionValue, false
    );
  });
}

function fillIsolatedProjectedRasterHoles(grid) {
  var holes = [];
  var width = grid.width;
  var height = grid.height;
  var coverage = grid.coverage;
  for (var y = 1; y < height - 1; y++) {
    for (var x = 1; x < width - 1; x++) {
      var i = y * width + x;
      if (!coverage[i] &&
          coverage[i - 1] && coverage[i + 1] &&
          coverage[i - width] && coverage[i + width]) {
        holes.push(i);
      }
    }
  }
  holes.forEach(function(i) {
    var src = (i - 1) * grid.bands;
    var dest = i * grid.bands;
    for (var band = 0; band < grid.bands; band++) {
      grid.samples[dest + band] = grid.samples[src + band];
    }
    coverage[i] = 1;
  });
}

function fillProjectedRasterCoverage(grid) {
  // Used only for layouts whose projected outline fills the output rectangle.
  var width = grid.width;
  var height = grid.height;
  var coverage = grid.coverage;
  for (var y = 0; y < height; y++) {
    var row = y * width;
    var source = -1;
    for (var x = 0; x < width; x++) {
      var i = row + x;
      if (coverage[i]) {
        source = i;
      } else if (source >= 0) {
        copyProjectedRasterPixel(grid, source, i);
      }
    }
    source = -1;
    for (x = width - 1; x >= 0; x--) {
      i = row + x;
      if (coverage[i]) {
        source = i;
      } else if (source >= 0) {
        copyProjectedRasterPixel(grid, source, i);
      }
    }
  }
}

function copyProjectedRasterPixel(grid, sourceIndex, destIndex) {
  var source = sourceIndex * grid.bands;
  var dest = destIndex * grid.bands;
  for (var band = 0; band < grid.bands; band++) {
    grid.samples[dest + band] = grid.samples[source + band];
  }
  grid.coverage[destIndex] = 1;
}

function createProjectedRegionMask(grid, regions, fill) {
  var mask = new Uint8Array(grid.width * grid.height);
  var values = new Map();
  regions.forEach(function(region, i) {
    var value = i + 1;
    values.set(region.id, value);
    rasterizeRegionMask(grid, mask, region.boundary, value);
  });
  if (fill) fillRegionMask(mask, grid.width, grid.height);
  return {mask: mask, values: values};
}

function fillRegionMask(mask, width, height) {
  for (var y = 0; y < height; y++) {
    var row = y * width;
    var value = 0;
    for (var x = 0; x < width; x++) {
      if (mask[row + x]) value = mask[row + x];
      else if (value) mask[row + x] = value;
    }
    value = 0;
    for (x = width - 1; x >= 0; x--) {
      if (mask[row + x]) value = mask[row + x];
      else if (value) mask[row + x] = value;
    }
  }
}

function rasterizeRegionMask(grid, mask, boundary, value) {
  var ring = boundary.map(function(p) {
    return mapXYToRasterPixel(grid, p[0], p[1]);
  });
  var ymin = Math.max(0, Math.floor(Math.min.apply(null, ring.map(function(p) { return p[1]; }))));
  var ymax = Math.min(grid.height - 1, Math.ceil(Math.max.apply(null, ring.map(function(p) { return p[1]; }))));
  var intersections = [];
  for (var y = ymin; y <= ymax; y++) {
    var py = y + 0.5;
    intersections.length = 0;
    for (var i = 1; i < ring.length; i++) {
      var a = ring[i - 1];
      var b = ring[i];
      if ((a[1] > py) == (b[1] > py)) continue;
      intersections.push(a[0] + (py - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    intersections.sort(function(a, b) { return a - b; });
    for (var j = 1; j < intersections.length; j += 2) {
      var x0 = Math.max(0, Math.ceil(intersections[j - 1] - 0.5));
      var x1 = Math.min(grid.width - 1, Math.floor(intersections[j] - 0.5));
      for (var x = x0; x <= x1; x++) {
        mask[y * grid.width + x] = value;
      }
    }
  }
}

function rasterizeProjectedTriangle(srcGrid, destGrid, a, b, c, sampleMethod, regionMask, regionValue, sourceWrapX) {
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
      if (regionMask && regionMask[y * destGrid.width + x] != regionValue) continue;
      w1 = edgeFunction(bp, cp, x + 0.5, y + 0.5) / det;
      w2 = edgeFunction(cp, ap, x + 0.5, y + 0.5) / det;
      w3 = 1 - w1 - w2;
      if (w1 < -1e-9 || w2 < -1e-9 || w3 < -1e-9) continue;
      sx = w1 * a.sx + w2 * b.sx + w3 * c.sx;
      sy = w1 * a.sy + w2 * b.sy + w3 * c.sy;
      copyRasterSample(
        srcGrid, destGrid, sx, sy, x, y, sampleMethod, sourceWrapX);
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

function copyRasterSample(srcGrid, destGrid, sx, sy, dx, dy, sampleMethod, wrapX) {
  if (sampleMethod == 'bilinear') {
    copyBilinearRasterSample(srcGrid, destGrid, sx, sy, dx, dy, wrapX);
  } else {
    copyNearestRasterSample(srcGrid, destGrid, sx, sy, dx, dy, wrapX);
  }
}

function copyNearestRasterSample(srcGrid, destGrid, sx, sy, dx, dy, wrapX) {
  var srcX = wrapX ?
    modulo(Math.floor(sx), srcGrid.width) :
    clamp(Math.floor(sx), 0, srcGrid.width - 1);
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

function copyBilinearRasterSample(srcGrid, destGrid, sx, sy, dx, dy, wrapX) {
  if (wrapX) sx = modulo(sx, srcGrid.width);
  var srcX = wrapX ?
    modulo(Math.floor(sx - 0.5), srcGrid.width) :
    clamp(Math.floor(sx - 0.5), 0, srcGrid.width - 1);
  var srcY = clamp(Math.floor(sy - 0.5), 0, srcGrid.height - 1);
  var srcX2 = wrapX ? (srcX + 1) % srcGrid.width :
    clamp(srcX + 1, 0, srcGrid.width - 1);
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

function modulo(val, base) {
  return (val % base + base) % base;
}
