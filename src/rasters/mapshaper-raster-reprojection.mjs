import {
  getProjTransform2,
  isLatLngCRS,
  parseCrsString
} from '../crs/mapshaper-projections';
import { getProjectionTopology } from '../crs/mapshaper-projection-topology';
import { getRasterGrid, rasterGridIsRotated } from './mapshaper-raster-utils';
import {
  getRasterValidityMask,
  rasterPixelIsCovered,
  rasterSamplesAreFloat
} from './mapshaper-raster-grid';
import { fillEmptyRasterPixels, rasterAppearsCategorical } from './mapshaper-raster-fill';
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
// Area averaging reads at most this many source pixels along each side of a
// footprint, so a nearly degenerate mesh triangle can't make it read the
// whole source grid for one output pixel.
var MAX_AVERAGE_FOOTPRINT = 16;

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
  // fill_layout: false leaves the gaps along a layout's outline, for callers
  // that use the coverage as a mask
  if (mesh.fillOutputCoverage && opts.fill_layout !== false && meshCoversLayout(mesh)) {
    fillProjectedRasterCoverage(outGrid);
  } else {
    fillIsolatedProjectedRasterHoles(outGrid);
  }
  // fill_uncovered: false leaves empty pixels at 0, for callers that mask
  // them using the coverage array
  if (opts.fill_uncovered !== false) {
    fillEmptyRasterPixels(outGrid, raster, opts);
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
  if (method != 'nearest' && method != 'bilinear' && method != 'average') {
    stop('Unsupported resampling method:', method);
  }
  return method;
}

function getDefaultRasterProjectionSampleMethod(raster) {
  return rasterAppearsCategorical(raster) ? 'nearest' : 'bilinear';
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
  return buildProjectedRasterMesh(grid, transform, interval,
    getGeographicMeshBreaks(grid, srcCRS));
}

// @breaks (optional): {xs, ys} pixel positions that cells must not straddle
export function buildProjectedRasterMesh(grid, transform, interval, breaks) {
  var xs = getMeshStops(grid.width, interval, breaks && breaks.xs);
  var ys = getMeshStops(grid.height, interval, breaks && breaks.ys);
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
  var toGeographic = getRasterGeographicTransform(srcCRS);
  var fromGeographic = getProjTransform2(wgs84, srcCRS);
  var toDestination = getProjTransform2(wgs84, destCRS);
  interval = Math.min(interval, topology.raster_mesh_interval || interval);
  var breaks = getGeographicMeshBreaks(grid, srcCRS);
  var xs = getMeshStops(grid.width, interval, breaks && breaks.xs);
  var ys = getMeshStops(grid.height, interval, breaks && breaks.ys);
  var regions = topology.raster_regions || topology.regions;
  var mesh = {
    xs: xs,
    ys: ys,
    vertices: [],
    cells: [],
    sourceWidth: grid.width,
    sourceHeight: grid.height,
    sourceIsGlobal: rasterSpansGlobe(grid, srcCRS),
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
    sourceWidth: grid.width,
    sourceHeight: grid.height,
    sourceIsGlobal: rasterSpansGlobe(grid, srcCRS),
    topologyAware: true,
    subdivisionSkippedCellCount: 0,
    fillRegionMask: topology.fill_raster_mask,
    fillOutputCoverage: topology.fill_raster_coverage,
    projectedRegions: getProjectedRasterRegions(
      topology, regions, destCRS, getProjTransform2(wgs84, destCRS)),
    sourceWrap: getSourceWrapWindow(grid, srcCRS)
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
  var sourceIsLinear;
  normalizeWrappedTrianglePixels(rawVertices, context.mesh.sourceWrap);
  sourceIsLinear = sourcePixelsAreLinear(context, triangle, rawVertices);
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
        sourceIsLinear: sourceIsLinear,
        valid: vertices.every(vertexIsValid)
      });
    }
  });
}

// Whether a triangle's source pixels can be interpolated between its vertices:
// each edge's midpoint is near the middle of the edge in source pixels. Not
// for a triangle that crosses a discontinuity of the source CRS, e.g. the
// antimeridian of a lat-long grid that doesn't wrap, where interpolating
// sweeps across the whole grid.
var MAX_SOURCE_MIDPOINT_ERROR = 0.25;

function sourcePixelsAreLinear(context, triangle, vertices) {
  var grid = context.grid, wrap = context.mesh.sourceWrap;
  return [0, 1, 2].every(function(i) {
    var j = (i + 1) % 3, a = vertices[i], b = vertices[j];
    var mid = sphericalPointMidpoint(triangle[i], triangle[j]);
    var xy = context.fromGeographic(mid[0], mid[1]);
    var p = xy && rasterMapXYToPixel(grid, xy[0], xy[1]);
    var dx, dy;
    if (!p || !isFinite(a.sx + a.sy + b.sx + b.sy)) return false;
    dx = p[0] - (a.sx + b.sx) / 2;
    dy = p[1] - (a.sy + b.sy) / 2;
    if (wrap) dx = modulo(dx + wrap.period / 2, wrap.period) - wrap.period / 2;
    return Math.hypot(dx, dy) <= 1 + MAX_SOURCE_MIDPOINT_ERROR * Math.hypot(b.sx - a.sx, b.sy - a.sy);
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

function normalizeWrappedTrianglePixels(vertices, wrap) {
  if (!wrap) return;
  var xmin = Math.min(vertices[0].sx, vertices[1].sx, vertices[2].sx);
  var xmax = Math.max(vertices[0].sx, vertices[1].sx, vertices[2].sx);
  var mid = wrap.x0 + wrap.period / 2;
  if (xmax - xmin <= wrap.period / 2) return;
  vertices.forEach(function(vertex) {
    if (vertex.sx < mid) vertex.sx += wrap.period;
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
  var core = [];
  samplePieceRegions(context, core, x0, y0, x1, y1);
  getPieceRegionsInCell(context, x0, y0, x1, y1, core).forEach(function(regionId) {
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
      // in a region only because it is near the cell, which the region mask
      // hides outside the region
      halo: core.indexOf(regionId) == -1,
      valid: vertexIsValid(v00) && vertexIsValid(v10) &&
        vertexIsValid(v01) && vertexIsValid(v11)
    };
    context.mesh.vertices.push(v00, v10, v01, v11);
    context.mesh.cells.push(cell);
  });
}

// @core: the regions found in the cell itself
function getPieceRegionsInCell(context, x0, y0, x1, y1, core) {
  var ids = core.concat();
  var halo = context.pieceHalo;
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
      addPieceRegions(ids, lonlat && context.findRegion(lonlat[0], lonlat[1]));
    }
  }
}

// @id: a region id, or an array of ids for a place that the projection shows
//   more than once
function addPieceRegions(ids, id) {
  if (Array.isArray(id)) {
    id.forEach(function(id) { addPieceRegions(ids, id); });
  } else if (id != null && id !== -1 && ids.indexOf(id) == -1) {
    ids.push(id);
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
  var toGeographic = getRasterGeographicTransform(srcCRS);
  var toDestination = getProjTransform2(wgs84, destCRS);
  var breaks = getGeographicMeshBreaks(grid, srcCRS);
  var xs = getMeshStops(grid.width, interval, breaks && breaks.xs);
  var ys = getMeshStops(grid.height, interval, breaks && breaks.ys);
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
  if (!findRegion) return buildProjectedRasterMesh(grid, getProjTransform2(srcCRS, destCRS), interval, breaks);
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
  if (!grid || !grid.samples || !grid.bbox) stop('Raster layer is missing required projection data');
  if (rasterGridIsRotated(grid)) {
    stop('Raster reprojection does not support rotated or skewed rasters');
  }
}

function getMeshStops(size, interval, breaks) {
  var stops = [];
  var i;
  interval = Math.max(1, interval | 0);
  for (i = 0; i < size; i += interval) {
    stops.push(i);
  }
  if (stops[stops.length - 1] != size) stops.push(size);
  if (breaks && breaks.length > 0) {
    breaks.forEach(function(b) {
      var rounded = Math.round(b);
      if (Math.abs(b - rounded) < 1e-6) b = rounded;
      if (b > 0 && b < size) stops.push(b);
    });
    stops.sort(function(a, b) { return a - b; });
    stops = stops.filter(function(stop, i) {
      return i === 0 || stop - stops[i - 1] > 1e-6;
    });
  }
  return stops;
}

// Pixel positions where a lat-long grid crosses the antimeridian or a pole
// (e.g. a grid with a bleed margin). Mesh cells must not straddle these:
// getProjTransform2() clamps longitudes to [-180, 180], so a straddling cell
// would be squashed against the antimeridian while still sampling the source
// across its full width, leaving seams and gaps along the antimeridian.
// Cells beyond the antimeridian collapse to zero area and draw nothing.
function getGeographicMeshBreaks(grid, srcCRS) {
  if (!isLatLngCRS(srcCRS)) return null;
  var a = rasterPixelToMapXY(grid, 0, 0);
  var b = rasterPixelToMapXY(grid, grid.width, grid.height);
  var xmin = Math.min(a[0], b[0]);
  var xmax = Math.max(a[0], b[0]);
  var xs = [];
  for (var k = Math.ceil((xmin + 180) / 360); k <= Math.floor((xmax + 180) / 360); k++) {
    xs.push(rasterMapXYToPixel(grid, k * 360 - 180, 0)[0]);
  }
  return {
    xs: xs,
    ys: [rasterMapXYToPixel(grid, 0, 90)[1], rasterMapXYToPixel(grid, 0, -90)[1]]
  };
}

// Unlike longitudes, latitudes beyond the poles pass through the lat-long
// transform, and spherical projection code would treat them as points on the
// far side of the pole.
function getRasterGeographicTransform(srcCRS) {
  var transform = getProjTransform2(srcCRS, parseCrsString('wgs84'));
  if (!isLatLngCRS(srcCRS)) return transform;
  return function(x, y) {
    return y > 90 + 1e-9 || y < -90 - 1e-9 ? null : transform(x, y);
  };
}

// Pixel window that holds one copy of the globe in a lat-long grid spanning at
// least 360 degrees, for sampling across the antimeridian. Returns null unless
// the window is aligned with whole pixels.
function getSourceWrapWindow(grid, srcCRS) {
  if (!isLatLngCRS(srcCRS)) return null;
  var x0 = rasterMapXYToPixel(grid, -180, 0)[0];
  var x1 = rasterMapXYToPixel(grid, 180, 0)[0];
  var r0 = Math.round(x0);
  var r1 = Math.round(x1);
  if (Math.abs(x0 - r0) > 0.01 || Math.abs(x1 - r1) > 0.01) return null;
  if (r0 < 0 || r1 > grid.width || r1 - r0 < 2) return null;
  return {x0: r0, period: r1 - r0};
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

// A mesh of a layout's regions (facets, lobes) gets the extent of the raster
// in the layout, so that a regional raster gets a regional grid; a raster that
// covers (nearly) the whole layout gets the layout's extent.
function getProjectedMeshBBox(mesh) {
  var layout, footprint;
  if (!mesh.projectedRegions) {
    return getBoundsBBox(mesh.cells.reduce(function(bounds, cell) {
      if (cell.valid) [cell.v00, cell.v10, cell.v01, cell.v11].forEach(function(p) { expandBounds(bounds, p.x, p.y); });
      return bounds;
    }, newBounds()));
  }
  layout = getProjectedRegionsBBox(mesh.projectedRegions);
  footprint = getMeshFootprintBBox(mesh);
  if (!layout || !footprint) return footprint || layout;
  return meshCoversLayout(mesh) ? layout : [
    Math.max(footprint[0], layout[0]), Math.max(footprint[1], layout[1]),
    Math.min(footprint[2], layout[2]), Math.min(footprint[3], layout[3])
  ];
}

// The raster covers a layout's regions if its extent in the layout comes
// within this fraction of the layout's width and height on each side
var LAYOUT_COVERAGE_TOLERANCE = 0.01;

function meshCoversLayout(mesh) {
  var layout, footprint, dx, dy;
  if (!mesh.projectedRegions) return false;
  if (mesh.sourceIsGlobal) return true;
  if (mesh.coversLayout === undefined) {
    layout = getProjectedRegionsBBox(mesh.projectedRegions);
    footprint = getMeshFootprintBBox(mesh);
    dx = layout ? (layout[2] - layout[0]) * LAYOUT_COVERAGE_TOLERANCE : 0;
    dy = layout ? (layout[3] - layout[1]) * LAYOUT_COVERAGE_TOLERANCE : 0;
    mesh.coversLayout = !!(layout && footprint &&
      footprint[0] <= layout[0] + dx && footprint[1] <= layout[1] + dy &&
      footprint[2] >= layout[2] - dx && footprint[3] >= layout[3] - dy);
  }
  return mesh.coversLayout;
}

// A lat-long grid all the way around the globe (which may leave out the polar
// regions) is a world raster, and gets a layout's full extent
function rasterSpansGlobe(grid, srcCRS) {
  var a, b;
  if (!isLatLngCRS(srcCRS)) return false;
  a = rasterPixelToMapXY(grid, 0, 0);
  b = rasterPixelToMapXY(grid, grid.width, 0);
  return Math.abs(b[0] - a[0]) >= 360 - 1e-6;
}

function getProjectedRegionsBBox(regions) {
  return getBoundsBBox(regions.reduce(function(bounds, region) {
    region.boundary.forEach(function(p) { if (p) expandBounds(bounds, p[0], p[1]); });
    return bounds;
  }, newBounds()));
}

// The extent of the raster in a mesh of a layout's regions, which also covers
// places outside the raster: each triangle clipped to the source grid, in
// source pixels. Cells in a region only as a halo are left out, since the
// region mask hides them (see appendPiecewiseMeshCells()).
function getMeshFootprintBBox(mesh) {
  var bounds, wrapX;
  if (mesh.footprint !== undefined) return mesh.footprint;
  bounds = newBounds();
  // the source wraps around the globe, so it has no sides
  wrapX = !!mesh.sourceWrap;
  (mesh.triangles || []).forEach(function(t) {
    if (t.valid && t.sourceIsLinear !== false) addClippedTriangleBounds(bounds, [t.a, t.b, t.c], mesh, wrapX);
  });
  mesh.cells.forEach(function(cell) {
    if (!cell.valid || cell.halo) return;
    addClippedTriangleBounds(bounds, [cell.v00, cell.v10, cell.v11], mesh, wrapX);
    addClippedTriangleBounds(bounds, [cell.v00, cell.v11, cell.v01], mesh, wrapX);
  });
  mesh.footprint = getBoundsBBox(bounds);
  return mesh.footprint;
}

function addClippedTriangleBounds(bounds, triangle, mesh, wrapX) {
  var poly = triangle;
  if (!poly.every(function(p) { return isFinite(p.sx) && isFinite(p.sy); })) return;
  if (!wrapX) {
    poly = clipSourcePolygon(poly, 'sx', 0, 1);
    poly = clipSourcePolygon(poly, 'sx', mesh.sourceWidth, -1);
  }
  poly = clipSourcePolygon(poly, 'sy', 0, 1);
  poly = clipSourcePolygon(poly, 'sy', mesh.sourceHeight, -1);
  poly.forEach(function(p) { expandBounds(bounds, p.x, p.y); });
}

// The part of polygon @poly (mesh vertices) on the side of a source grid edge
// at @edge on axis @key (sx or sy) where @sign * (value - edge) >= 0. Mesh
// triangles map source pixels to projected coordinates linearly, so new
// vertices interpolate both.
function clipSourcePolygon(poly, key, edge, sign) {
  var out = [], n = poly.length, i, p, q, dp, dq, t;
  for (i = 0; i < n; i++) {
    p = poly[i];
    q = poly[(i + 1) % n];
    dp = sign * (p[key] - edge);
    dq = sign * (q[key] - edge);
    if (dp >= 0) out.push(p);
    if (dp >= 0 != dq >= 0) {
      t = dp / (dp - dq);
      out.push({
        sx: p.sx + t * (q.sx - p.sx),
        sy: p.sy + t * (q.sy - p.sy),
        x: p.x + t * (q.x - p.x),
        y: p.y + t * (q.y - p.y)
      });
    }
  }
  return out;
}

function newBounds() {
  return [Infinity, Infinity, -Infinity, -Infinity];
}

function expandBounds(bounds, x, y) {
  if (!isFinite(x) || !isFinite(y)) return;
  if (x < bounds[0]) bounds[0] = x;
  if (y < bounds[1]) bounds[1] = y;
  if (x > bounds[2]) bounds[2] = x;
  if (y > bounds[3]) bounds[3] = y;
}

function getBoundsBBox(bounds) {
  return bounds[0] < Infinity && bounds[2] > bounds[0] && bounds[3] > bounds[1] ? bounds : null;
}

function createProjectedRasterGrid(grid, raster, bbox, widthArg, heightArg, opts) {
  var width = widthArg || grid.width;
  var height = heightArg || grid.height;
  var bands = grid.bands;
  var samples = new grid.samples.constructor(width * height * bands);
  var coverage = new Uint8Array(width * height);
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

function rasterizeProjectedMesh(srcGrid, destGrid, mesh, sampleMethodArg) {
  var sampleMethod = getRasterSamplerContext(srcGrid, destGrid, sampleMethodArg);
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
      mesh.sourceWrap, true, triangle.sourceIsLinear === false
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

// @sourceWrap: optional window from getSourceWrapWindow()
// @clipToSource: skip pixels whose source position is outside the source grid,
//   for meshes that cover the whole globe, beyond the raster (the sampler
//   would repeat the grid's edge pixels there)
// @nonlinear: the triangle's source pixels can't be interpolated (see
//   sourcePixelsAreLinear()), so with @clipToSource it is skipped unless it is
//   inside the source grid
function rasterizeProjectedTriangle(srcGrid, destGrid, a, b, c, sampleMethod, regionMask, regionValue, sourceWrap, clipToSource, nonlinear) {
  var bbox, x0, x1, y0, y1, det, w1, w2, w3, sx, sy, ap, bp, cp, outside;
  if (!vertexIsValid(a) || !vertexIsValid(b) || !vertexIsValid(c)) return;
  outside = clipToSource && !triangleIsInsideSource(srcGrid, a, b, c, sourceWrap);
  if (outside && nonlinear) return;
  ap = vertexToDestPixel(destGrid, a);
  bp = vertexToDestPixel(destGrid, b);
  cp = vertexToDestPixel(destGrid, c);
  det = triangleDet(ap, bp, cp);
  if (det === 0) return;
  if (sampleMethod.average) setAverageFootprint(sampleMethod.footprint, ap, bp, cp, det);
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
      if (outside && (sy < 0 || sy > srcGrid.height || !sourceWrap && (sx < 0 || sx > srcGrid.width))) continue;
      copyRasterSample(
        srcGrid, destGrid, sx, sy, x, y, sampleMethod, sourceWrap);
    }
  }
}

function triangleIsInsideSource(grid, a, b, c, sourceWrap) {
  return [a, b, c].every(function(p) {
    return p.sy >= 0 && p.sy <= grid.height && (sourceWrap || p.sx >= 0 && p.sx <= grid.width);
  });
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

// Per-projection sampling context, built once so the inner rasterizing loop
// does not repeat type or metadata tests for every output pixel.
function getRasterSamplerContext(srcGrid, destGrid, method) {
  var average = method == 'average';
  return {
    bilinear: method == 'bilinear',
    average: average,
    // set for each mesh triangle by setAverageFootprint()
    footprint: average ? {} : null,
    sums: average ? new Float64Array(srcGrid.bands) : null,
    // Integer sample arrays truncate on assignment, so interpolated values
    // have to be rounded explicitly. Float arrays must NOT be rounded, or
    // elevation data loses its sub-unit precision.
    round: !rasterSamplesAreFloat(destGrid.samples),
    // Resolved once for the whole source grid; null means every pixel is
    // valid and the sampler can skip validity testing altogether.
    validity: getRasterValidityMask(srcGrid)
  };
}

// @wrap: optional window from getSourceWrapWindow()
function copyRasterSample(srcGrid, destGrid, sx, sy, dx, dy, sampler, wrap) {
  if (sampler.average && sampler.footprint.valid) {
    copyAverageRasterSample(srcGrid, destGrid, sx, sy, dx, dy, sampler, wrap);
  } else if (sampler.bilinear || sampler.average) {
    copyBilinearRasterSample(srcGrid, destGrid, sx, sy, dx, dy, sampler, wrap);
  } else {
    copyNearestRasterSample(srcGrid, destGrid, sx, sy, dx, dy, wrap);
  }
}

function wrapSourceX(x, wrap) {
  return wrap.x0 + modulo(x - wrap.x0, wrap.period);
}

// Area averaging: an output pixel is the average of the source pixels under
// its footprint, each weighted by how much of the footprint it covers, so
// source detail finer than the output is averaged rather than skipped
// (aliasing). Within a mesh triangle, output pixels map to source pixels by
// an affine transform, so every pixel of the triangle has the same footprint,
// a parallelogram.
//
// Weights are products of overlaps measured along the footprint's own two
// axes: exact for footprints aligned with the source grid, and close for
// rotated ones. A footprint less than one source pixel across is widened to
// one pixel, which makes the weights bilinear where the source is coarser
// than the output.
//
// Sets the footprint of the output pixels in triangle @a @b @c (output pixel
// coordinates, with source pixel coordinates in .sx and .sy).
function setAverageFootprint(fp, a, b, c, det) {
  var w1x = (c.y - b.y) / det, w1y = (b.x - c.x) / det;
  var w2x = (a.y - c.y) / det, w2y = (c.x - a.x) / det;
  // source pixels per output pixel: (j00, j10) along x, (j01, j11) along y
  var j00 = w1x * (a.sx - c.sx) + w2x * (b.sx - c.sx);
  var j10 = w1x * (a.sy - c.sy) + w2x * (b.sy - c.sy);
  var j01 = w1y * (a.sx - c.sx) + w2y * (b.sx - c.sx);
  var j11 = w1y * (a.sy - c.sy) + w2y * (b.sy - c.sy);
  var kx = getFootprintScale(Math.sqrt(j00 * j00 + j10 * j10));
  var ky = getFootprintScale(Math.sqrt(j01 * j01 + j11 * j11));
  var jdet, i00, i01, i10, i11;
  j00 *= kx; j10 *= kx;
  j01 *= ky; j11 *= ky;
  jdet = j00 * j11 - j01 * j10;
  fp.valid = Math.abs(jdet) > 1e-12;
  if (!fp.valid) return;
  // inverse: source pixel offsets to footprint coordinates (u, v), in which
  // the footprint is the square [-0.5, 0.5] x [-0.5, 0.5]
  i00 = j11 / jdet; i01 = -j01 / jdet;
  i10 = -j10 / jdet; i11 = j00 / jdet;
  fp.i00 = i00; fp.i01 = i01; fp.i10 = i10; fp.i11 = i11;
  // half the extent of a source pixel along u and v
  fp.hu = (Math.abs(i00) + Math.abs(i01)) / 2;
  fp.hv = (Math.abs(i10) + Math.abs(i11)) / 2;
  // how far from the footprint's center a source pixel's center can be and
  // still have a nonzero weight
  fp.rx = (0.5 + fp.hu) * Math.abs(j00) + (0.5 + fp.hv) * Math.abs(j01);
  fp.ry = (0.5 + fp.hu) * Math.abs(j10) + (0.5 + fp.hv) * Math.abs(j11);
}

function getFootprintScale(len) {
  if (!(len > 0)) return 1;
  if (len < 1) return 1 / len;
  if (len > MAX_AVERAGE_FOOTPRINT) return MAX_AVERAGE_FOOTPRINT / len;
  return 1;
}

// Source pixels outside the grid, or invalid, are skipped and the remaining
// weights renormalized, so nodata is never blended into a real value.
function copyAverageRasterSample(srcGrid, destGrid, sx, sy, dx, dy, sampler, wrap) {
  var fp = sampler.footprint;
  var width = srcGrid.width;
  var bands = srcGrid.bands;
  var samples = srcGrid.samples;
  var validity = sampler.validity;
  var sums = sampler.sums;
  var i00 = fp.i00, i01 = fp.i01, i10 = fp.i10, i11 = fp.i11, hu = fp.hu, hv = fp.hv;
  var x0 = Math.ceil(sx - fp.rx - 0.5);
  var x1 = Math.floor(sx + fp.rx - 0.5);
  var y0 = Math.max(0, Math.ceil(sy - fp.ry - 0.5));
  var y1 = Math.min(srcGrid.height - 1, Math.floor(sy + fp.ry - 0.5));
  var total = 0;
  var x, y, ox, oy, u, v, wu, wv, w, k, i, band, dest, val;
  if (!wrap) {
    x0 = Math.max(0, x0);
    x1 = Math.min(width - 1, x1);
  }
  for (band = 0; band < bands; band++) sums[band] = 0;
  for (y = y0; y <= y1; y++) {
    oy = y + 0.5 - sy;
    for (x = x0; x <= x1; x++) {
      ox = x + 0.5 - sx;
      u = i00 * ox + i01 * oy;
      wu = Math.min(0.5, u + hu) - Math.max(-0.5, u - hu);
      if (wu <= 0) continue;
      v = i10 * ox + i11 * oy;
      wv = Math.min(0.5, v + hv) - Math.max(-0.5, v - hv);
      if (wv <= 0) continue;
      k = y * width + (wrap ? wrapSourceX(x, wrap) : x);
      if (validity && !validity[k]) continue;
      w = wu * wv;
      i = k * bands;
      for (band = 0; band < bands; band++) sums[band] += samples[i + band] * w;
      total += w;
    }
  }
  if (!(total > 0)) return;
  dest = (dy * destGrid.width + dx) * destGrid.bands;
  for (band = 0; band < bands; band++) {
    val = sums[band] / total;
    destGrid.samples[dest + band] = sampler.round ? Math.round(val) : val;
  }
  if (destGrid.coverage) destGrid.coverage[dy * destGrid.width + dx] = 1;
}

function copyNearestRasterSample(srcGrid, destGrid, sx, sy, dx, dy, wrap) {
  var srcX = wrap ?
    wrapSourceX(Math.floor(sx), wrap) :
    clamp(Math.floor(sx), 0, srcGrid.width - 1);
  var srcY = clamp(Math.floor(sy), 0, srcGrid.height - 1);
  var src = (srcY * srcGrid.width + srcX) * srcGrid.bands;
  var dest = (dy * destGrid.width + dx) * destGrid.bands;
  // Nearest sampling copies a nodata sample through unchanged, rather than
  // skipping it, so nodata areas survive a round trip.
  if (!rasterPixelIsCovered(srcGrid, srcY * srcGrid.width + srcX)) return;
  for (var band = 0; band < srcGrid.bands; band++) {
    destGrid.samples[dest + band] = srcGrid.samples[src + band];
  }
  if (destGrid.coverage) destGrid.coverage[dy * destGrid.width + dx] = 1;
}

function copyBilinearRasterSample(srcGrid, destGrid, sx, sy, dx, dy, sampler, wrap) {
  var fx = Math.floor(sx - 0.5);
  var srcX = wrap ? wrapSourceX(fx, wrap) : clamp(fx, 0, srcGrid.width - 1);
  var srcY = clamp(Math.floor(sy - 0.5), 0, srcGrid.height - 1);
  var srcX2 = wrap ? wrapSourceX(fx + 1, wrap) :
    clamp(srcX + 1, 0, srcGrid.width - 1);
  var srcY2 = clamp(srcY + 1, 0, srcGrid.height - 1);
  var tx = wrap ? sx - 0.5 - fx : clamp(sx - 0.5 - srcX, 0, 1);
  var ty = clamp(sy - 0.5 - srcY, 0, 1);
  var src00 = (srcY * srcGrid.width + srcX) * srcGrid.bands;
  var src10 = (srcY * srcGrid.width + srcX2) * srcGrid.bands;
  var src01 = (srcY2 * srcGrid.width + srcX) * srcGrid.bands;
  var src11 = (srcY2 * srcGrid.width + srcX2) * srcGrid.bands;
  var dest = (dy * destGrid.width + dx) * destGrid.bands;
  if (!sampler.validity) {
    copyBilinearRasterSampleFast(srcGrid, destGrid, src00, src10, src01, src11, dest, tx, ty, sampler.round);
    if (destGrid.coverage) destGrid.coverage[dy * destGrid.width + dx] = 1;
    return;
  }
  if (copyBilinearRasterSampleChecked(srcGrid, destGrid, sampler.validity, srcX, srcY, srcX2, srcY2, src00, src10, src01, src11, dest, tx, ty, sampler.round)) {
    if (destGrid.coverage) destGrid.coverage[dy * destGrid.width + dx] = 1;
  }
}

function copyBilinearRasterSampleFast(srcGrid, destGrid, src00, src10, src01, src11, dest, tx, ty, round) {
  if (srcGrid.bands == 3) {
    copyBilinearRgbSample(srcGrid.samples, destGrid.samples, src00, src10, src01, src11, dest, tx, ty, round);
  } else if (srcGrid.bands == 4) {
    copyBilinearRgbaSample(srcGrid.samples, destGrid.samples, src00, src10, src01, src11, dest, tx, ty, round);
  } else {
    copyBilinearGenericSample(srcGrid.samples, destGrid.samples, srcGrid.bands, src00, src10, src01, src11, dest, tx, ty, round);
  }
}

function copyBilinearRgbSample(src, destArr, src00, src10, src01, src11, dest, tx, ty, round) {
  copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, 0, tx, ty, round);
  copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, 1, tx, ty, round);
  copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, 2, tx, ty, round);
}

function copyBilinearRgbaSample(src, destArr, src00, src10, src01, src11, dest, tx, ty, round) {
  copyBilinearRgbSample(src, destArr, src00, src10, src01, src11, dest, tx, ty, round);
  copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, 3, tx, ty, round);
}

function copyBilinearGenericSample(src, destArr, bands, src00, src10, src01, src11, dest, tx, ty, round) {
  for (var band = 0; band < bands; band++) {
    copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, band, tx, ty, round);
  }
}

function copyBilinearBand(src, destArr, src00, src10, src01, src11, dest, band, tx, ty, round) {
  var a = src[src00 + band] * (1 - tx) + src[src10 + band] * tx;
  var b = src[src01 + band] * (1 - tx) + src[src11 + band] * tx;
  var val = a * (1 - ty) + b * ty;
  destArr[dest + band] = round ? Math.round(val) : val;
}

// Bilinear sampling that skips invalid source pixels and renormalizes the
// remaining weights, so nodata is never blended into a real value. Validity
// is resolved once per output pixel rather than once per band.
function copyBilinearRasterSampleChecked(srcGrid, destGrid, validity, srcX, srcY, srcX2, srcY2, src00, src10, src01, src11, dest, tx, ty, round) {
  var w00 = (1 - tx) * (1 - ty);
  var w10 = tx * (1 - ty);
  var w01 = (1 - tx) * ty;
  var w11 = tx * ty;
  var width = srcGrid.width;
  var samples = srcGrid.samples;
  var ok00 = w00 > 0 && validity[srcY * width + srcX] > 0;
  var ok10 = w10 > 0 && validity[srcY * width + srcX2] > 0;
  var ok01 = w01 > 0 && validity[srcY2 * width + srcX] > 0;
  var ok11 = w11 > 0 && validity[srcY2 * width + srcX2] > 0;
  var total = (ok00 ? w00 : 0) + (ok10 ? w10 : 0) + (ok01 ? w01 : 0) + (ok11 ? w11 : 0);
  var val;
  if (total <= 0) return false;
  for (var band = 0; band < srcGrid.bands; band++) {
    val = 0;
    if (ok00) val += samples[src00 + band] * w00;
    if (ok10) val += samples[src10 + band] * w10;
    if (ok01) val += samples[src01 + band] * w01;
    if (ok11) val += samples[src11 + band] * w11;
    val /= total;
    destGrid.samples[dest + band] = round ? Math.round(val) : val;
  }
  return true;
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
