import { getPolylineBufferMaker } from '../buffer/mapshaper-path-buffer-v4';
import { getBufferDistanceFunction, getBufferSimplifyFunction, dissolveBufferDataset2, getPathArcsByShape } from '../buffer/mapshaper-buffer-common';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { getRingIntersector } from '../paths/mapshaper-pathfinder';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { getDatasetCRS, isLatLngCRS } from '../crs/mapshaper-projections';
import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { DatasetEditor } from '../dataset/mapshaper-dataset-editor';
import { importGeoJSON } from '../geojson/geojson-import';
import { countCrosses, removePolygonCrosses } from '../geom/mapshaper-antimeridian-cuts';
import { getPlanarPathArea } from '../geom/mapshaper-polygon-geom';
import { pathIsClosed } from '../geom/mapshaper-path-geom';
import { R, D2R } from '../geom/mapshaper-basic-geom';
import { ShapeIter } from '../paths/mapshaper-shape-iter';
import { DataTable } from '../datatable/mapshaper-data-table';
import { time, timeEnd } from '../utils/mapshaper-logging';

export function makePolylineBuffer(lyr, dataset, opts) {
  time('buffer');
  var spherical = isLatLngCRS(getDatasetCRS(dataset));
  var oneSided = !!opts.left !== !!opts.right;
  var debug = opts.debug_offset || opts.debug_mosaic;
  // One-sided buffers use a winding-number fill, run per-feature so each source
  // path's mosaic stays small. The construction is one-sided by design (offset
  // curve + end caps + the source path as the inner edge), so the winding fill
  // alone yields near-complete coverage with the fewest wrong-side artifacts.
  // No wrong-side "lobe removal" pass is applied: a topological flood remover
  // was measured to make things strictly worse on every dataset -- it injected
  // thousands of coverage dents AND increased wrong-side path crossings (by
  // dropping band tiles at concave bends and leaking across folds). The
  // residual wrong-side lobes that survive on self-approaching paths originate
  // in the offset construction itself and cannot be cleaned at the tile level
  // without reintroducing those dents. Two-sided buffers keep the original
  // outline + boundary-flood dissolve + artifact-hole filter, which is faster
  // and has no wrong side to clean.
  //
  // The undocumented 'band-method' option forces the older non-winding
  // construction here too (the per-feature pipeline below handles one-sided
  // buffers via its winding_fill:false coverage test), as a conservative
  // fallback.
  var useWinding = oneSided && !debug && opts.winding_fill !== false &&
    !opts.band_method;
  if (useWinding) {
    // no_loop_removal: the one-sided construction's overshoot loops can be a
    // concave bend's only band coverage, so collapsing them would cut holes in
    // the buffer (see buildOneSidedRings); the winding dissolve fills the
    // self-overlap instead.
    var result = makePolylineBufferPerFeature(lyr, dataset,
      Object.assign({}, opts, {winding_fill: true, remove_lobes: false,
        no_loop_removal: true}));
    if (spherical) splitAntimeridianBufferDataset(result);
    timeEnd('buffer');
    return result;
  }
  var dataset2;
  if (debug) {
    // Debug visualizations (raw offset rings, mosaic) want the whole layer's
    // geometry/topology in one dataset; keep the original global dissolve for
    // them (no artifact-hole filter runs in debug mode anyway). Mirror the real
    // pipeline's construction so the debug view reflects what the buffer
    // actually builds: an all-closed-ring two-sided layer uses the winding-fill
    // + loop-removal construction (and a winding-number dissolve), so
    // debug-offset shows the loop-removed offset rings and the no-loop-removal
    // flag has a visible effect. (See makePolylineBufferTwoSidedPerFeature.)
    var useWindingConstruction = !oneSided && layerIsAllClosed(lyr, dataset.arcs);
    var debugMakerOpts = useWindingConstruction ?
      Object.assign({}, opts, {winding_fill: true}) : opts;
    var debugDissolveOpts = Object.assign({}, opts, {per_part_holes: true},
      useWindingConstruction ? {winding_fill: true} : null);
    dataset2 = importGeoJSON(makeShapeBufferGeoJSON(lyr, dataset, debugMakerOpts), {});
    dissolveBufferDataset2(dataset2, debugDissolveOpts);
  } else {
    dataset2 = makePolylineBufferTwoSidedPerFeature(lyr, dataset, opts, spherical);
  }
  if (spherical) {
    splitAntimeridianBufferDataset(dataset2);
  }
  timeEnd('buffer');
  return dataset2;
}

// Two-sided buffer pipeline, run per source feature. Each feature's outline
// rings are dissolved (and artifact-hole filtered) in isolation, then the
// per-feature results are merged into one polygon layer (one shape per buffered
// source feature, in input order). Buffering does not union across features --
// 560 input features yield 560 output shapes -- so a single global dissolve of
// every feature's rings pays to intersect overlapping buffers of distinct
// features whose tiles are then selected per shape anyway. On a world-scale
// line layer that global planar arrangement exploded the arc count ~20x and ran
// the process out of memory; per-feature isolation bounds peak memory to the
// most complex single feature. The dissolve collapses any internal cuts, so
// each feature's output boundary is identical to the global pipeline's.
// True if every part of a polyline shape is a closed ring (first vertex ==
// last vertex), so its two-sided buffer is an annulus per ring.
function shapeIsAllClosed(shape, arcs) {
  return !!shape && shape.length > 0 && shape.every(function(part) {
    return pathIsClosed(part, arcs);
  });
}

// True if every shape in the layer is made entirely of closed rings.
function layerIsAllClosed(lyr, arcs) {
  var shapes = lyr.shapes || [];
  return shapes.length > 0 && shapes.every(function(shape) {
    return shapeIsAllClosed(shape, arcs);
  });
}

function makePolylineBufferTwoSidedPerFeature(lyr, dataset, opts, spherical) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var simplifyFn = getBufferSimplifyFunction(dataset, opts); // null if tolerance=0
  var makerOpts = Object.assign({geometry_type: lyr.geometry_type}, opts);
  var makeShapeBuffer = getPolylineBufferMaker(dataset, makerOpts);
  // A shape whose parts are all closed rings buffers to an annulus per ring. The
  // default (open-path) construction builds each side as many split sections plus
  // join-sector rings (no loop removal), which floods the dissolve with raw rings
  // (~8x more on a dense coastline). Instead route these shapes through the same
  // winding-fill + loop-removal construction the polygon-ring buffer uses: one
  // continuous offset ring per side, with self-overlap loops stripped, resolved
  // by a winding-number dissolve. Open or mixed shapes keep the tuned outline +
  // boundary-flood path unchanged.
  var closedMaker = getPolylineBufferMaker(dataset,
    Object.assign({}, makerOpts, {winding_fill: true}));
  var useFilter = useArtifactHoleFilter(opts);
  var quadSegs = opts.quad_segs >= 2 ? opts.quad_segs : 8;
  var sagPct = 1 - Math.cos(Math.PI / 4 / quadSegs);
  // The two-sided pipeline is also reached by a one-sided buffer when the
  // winding fill is explicitly disabled (winding_fill: false); the hole filter
  // must then use its one-sided coverage test (see filterOutlineArtifactHolesFromShape).
  var oneSided = !!opts.left !== !!opts.right;
  var sideOpts = oneSided ? {
    side: opts.right ? -1 : 1,
    roundCaps: (opts.cap_style || 'round') == 'round'
  } : null;
  var dissolveOpts = Object.assign({}, opts, {per_part_holes: true});
  var closedDissolveOpts = Object.assign({}, dissolveOpts, {winding_fill: true});
  var datasets = [];
  lyr.shapes.forEach(function(shape, i) {
    var distance = distanceFn(i);
    if (!distance || !shape) return;
    // Closed-ring fast path only for ordinary two-sided buffers (the one-sided
    // construction reaches this function with winding_fill:false and needs its
    // own coverage handling); mixed open/closed shapes fall back too.
    var allClosed = !oneSided && shapeIsAllClosed(shape, dataset.arcs);
    var retn = (allClosed ? closedMaker : makeShapeBuffer)(shape, distance);
    var feats = (Array.isArray(retn) ? retn : [retn]).filter(Boolean);
    if (!feats.length) return;
    var ds = importGeoJSON(getBufferGeoJSON(feats), {});
    dissolveBufferDataset2(ds, allClosed ? closedDissolveOpts : dissolveOpts);
    if (useFilter && !allClosed) {
      var bufLyr = ds.layers[0];
      var intervalPct = simplifyFn ? simplifyFn(distance) / distance : 0;
      bufLyr.shapes = bufLyr.shapes.map(function(bufShape) {
        return filterOutlineArtifactHolesFromShape(bufShape, ds.arcs, shape,
          dataset.arcs, distance, intervalPct, sagPct, oneSided, sideOpts, spherical);
      });
    }
    datasets.push(ds);
  });
  if (!datasets.length) {
    return importGeoJSON({type: 'FeatureCollection', features: []}, {});
  }
  var merged = mergeDatasets(datasets);
  var shapes = [];
  merged.layers.forEach(function(l) {
    if (l.geometry_type == 'polygon') shapes.push.apply(shapes, l.shapes);
  });
  // Empty data table (one blank record per shape): the original global pipeline
  // imported the buffer rings as a GeoJSON layer, which left an attribute-less
  // data table on the result. mergeOutputLayersIntoDataset() copies the source
  // layer's attributes onto the buffer output only when the output has no data
  // table, so keeping this table preserves the two-sided buffer's bare
  // (GeometryCollection) output instead of inheriting the source fields.
  merged.layers = [{name: lyr.name, geometry_type: 'polygon', shapes: shapes,
    data: new DataTable(shapes.length)}];
  return merged;
}

// Per-feature one-sided buffer pipeline. Each source feature's buffer rings
// are dissolved in isolation (winding-number fill), then the per-feature
// results are concatenated into one dataset. Per-feature isolation keeps each
// mosaic small and preserves output order. The feature's source path is added
// as a coincident polyline: splicing it into the buffer topology pins the
// buffer's inner edge to the path exactly and anchors any wrong-side excursions
// to the path (measurably fewer wrong-side crossings than constructing without
// it). The path layer is dropped after intersection cutting (it has served its
// topological purpose; no wrong-side removal pass uses it -- see
// makePolylineBuffer).
function makePolylineBufferPerFeature(lyr, dataset, opts) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var makerOpts = Object.assign({geometry_type: lyr.geometry_type}, opts);
  var makeShapeBuffer = getPolylineBufferMaker(dataset, makerOpts);
  var pathIter = new ShapeIter(dataset.arcs);
  var dissolveOpts = Object.assign({}, opts, {per_part_holes: true});
  var datasets = [];
  lyr.shapes.forEach(function(shape, i) {
    var distance = distanceFn(i);
    if (!distance || !shape) return;
    var retn = makeShapeBuffer(shape, distance);
    var feats = (Array.isArray(retn) ? retn : [retn]).filter(Boolean);
    if (!feats.length) return;
    feats.forEach(function(f) { tagSource(f, i); });
    feats.push(makePathFeature(shape, i, pathIter));
    var ds = importGeoJSON(getBufferGeoJSON(feats), {});
    dissolveBufferDataset2(ds, dissolveOpts);
    datasets.push(ds);
  });
  if (!datasets.length) {
    return importGeoJSON({type: 'FeatureCollection', features: []}, {});
  }
  var merged = mergeDatasets(datasets);
  // collapse the per-feature polygon layers into a single layer, one shape per
  // buffered source feature (matching the order of the non-lobe pipeline)
  var shapes = [];
  merged.layers.forEach(function(l) {
    if (l.geometry_type == 'polygon') shapes.push.apply(shapes, l.shapes);
  });
  merged.layers = [{name: lyr.name, geometry_type: 'polygon', shapes: shapes}];
  return merged;
}

// Build the (undissolved) dataset used by the offset-line pipeline: a polygon
// layer of every feature's two-sided buffer rings plus a coincident polyline
// "wall" layer (the source path extended past each open end so it cuts the
// round caps boundary-to-boundary), both tagged with __bufsrc. Returned via
// importGeoJSON so the buffer rings and walls share one topology after
// addIntersectionCuts.
function buildSplitBufferDataset(lyr, dataset, opts) {
  var spherical = isLatLngCRS(getDatasetCRS(dataset));
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  // two-sided maker (drop left/right so both flanks are built)
  var makerOpts = Object.assign({geometry_type: lyr.geometry_type}, opts,
    {left: false, right: false});
  var makeShapeBuffer = getPolylineBufferMaker(dataset, makerOpts);
  var pathIter = new ShapeIter(dataset.arcs);
  var feats = [];
  lyr.shapes.forEach(function(shape, i) {
    var distance = distanceFn(i);
    if (!distance || !shape) return;
    var retn = makeShapeBuffer(shape, distance);
    var bufFeats = (Array.isArray(retn) ? retn : [retn]).filter(Boolean);
    if (!bufFeats.length) return;
    bufFeats.forEach(function(f) { tagSource(f, i); feats.push(f); });
    feats.push(makePathWallFeature(shape, i, pathIter, distance, spherical));
  });
  if (!feats.length) {
    return importGeoJSON({type: 'FeatureCollection', features: []}, {});
  }
  return importGeoJSON(getBufferGeoJSON(feats), {});
}

// Build a polyline layer of one-sided offset lines (the outside edge of the
// one-sided buffer polygon, excluding the round caps). Uses the split pipeline
// as its basis: the front-side buffer polygon's boundary is offset curve +
// caps + source-path edge; the source path is spliced in as coincident arcs
// (tagged via __bufsrc), so the path edge is dropped by a topological arc-id
// filter, and the caps are trimmed geometrically (vertices that fall beyond a
// path endpoint's perpendicular line). opts.left / opts.right select the side.
export function makeOffsetLines(lyr, dataset, opts) {
  time('buffer');
  var spherical = isLatLngCRS(getDatasetCRS(dataset));
  var ds = buildSplitBufferDataset(lyr, dataset, opts);
  if (!ds.arcs) { timeEnd('buffer'); return ds; } // no features
  var nodes = addIntersectionCuts(ds, {rebuild_topology: true});
  var polyLyr = ds.layers.filter(function(l) { return l.geometry_type == 'polygon'; })[0];
  var pathArcsByShape = getPathArcsByShape(ds, polyLyr);
  ds.layers = [polyLyr];
  var mosaicIndex = new MosaicIndex(polyLyr, nodes,
    {flat: false, no_holes: false, per_part_holes: true});
  var pathfind = getRingIntersector(mosaicIndex.nodes);
  var frontLeft = !!opts.left;
  var arcIter = new ShapeIter(nodes.arcs);
  var srcIter = new ShapeIter(dataset.arcs);
  var polyRecords = polyLyr.data && polyLyr.data.getRecords();
  var lines = [];
  polyLyr.shapes.forEach(function(shp, shapeId) {
    var pathParts = pathArcsByShape ? pathArcsByShape[shapeId] : null;
    var tiles = mosaicIndex.getFrontTilesByShapeId(shapeId, pathParts, frontLeft);
    if (!tiles.length) return;
    var rings = [], holes = [];
    tiles.forEach(function(t) { rings.push(t[0]); if (t.length > 1) holes = holes.concat(t.slice(1)); });
    var shape2 = pathfind(rings.concat(holes), 'dissolve');
    if (!shape2) return;
    var pathAbs = buildPathArcSet(pathParts);
    var srcId = polyRecords && polyRecords[shapeId] ? polyRecords[shapeId].__bufsrc : null;
    var terminals = srcId == null ? [] :
      getOpenPathTerminals(lyr.shapes[srcId], srcIter, spherical);
    shape2.forEach(function(ring) {
      extractNonPathRuns(ring, pathAbs).forEach(function(arcRun) {
        var coords = trimCapVertices(arcRunToCoords(arcRun, arcIter), terminals, spherical);
        if (offsetLineLength(coords) > 0) lines.push(coords);
      });
    });
  });
  var fc = {
    type: 'FeatureCollection',
    features: lines.map(function(coords) {
      return {type: 'Feature', properties: null,
        geometry: {type: 'LineString', coordinates: coords}};
    })
  };
  var out = importGeoJSON(fc, {});
  if (out.layers[0]) out.layers[0].name = lyr.name;
  timeEnd('buffer');
  return out;
}

// Absolute (forward) arc ids of the source-path arcs for a buffer shape.
function buildPathArcSet(pathParts) {
  var set = {};
  (pathParts || []).forEach(function(part) {
    part.forEach(function(a) { set[a < 0 ? ~a : a] = true; });
  });
  return set;
}

// Split one polygon-boundary ring (a cyclic arc-id sequence) into maximal runs
// of arcs that are NOT source-path arcs. A ring with no path arc is the offset
// loop of a closed source ring and is returned whole; a ring made entirely of
// path arcs yields nothing.
function extractNonPathRuns(ring, pathAbs) {
  var n = ring.length;
  var onPath = ring.map(function(a) { return !!pathAbs[a < 0 ? ~a : a]; });
  if (onPath.every(function(v) { return !v; })) return [ring.concat()];
  if (onPath.every(function(v) { return v; })) return [];
  var start = 0;
  for (var i = 0; i < n; i++) {
    if (!onPath[i] && onPath[(i - 1 + n) % n]) { start = i; break; }
  }
  var runs = [], cur = [];
  for (var k = 0; k < n; k++) {
    var j = (start + k) % n;
    if (onPath[j]) { if (cur.length) { runs.push(cur); cur = []; } }
    else cur.push(ring[j]);
  }
  if (cur.length) runs.push(cur);
  return runs;
}

// Concatenate the vertices of a head-to-tail run of arcs into a coordinate
// list (ShapeIter walks the run as one path part, dropping shared endpoints).
function arcRunToCoords(arcRun, iter) {
  var coords = [];
  iter.init(arcRun);
  while (iter.hasNext()) coords.push([iter.x, iter.y]);
  return coords;
}

// Perpendicular "stop lines" at each open end of a source path: a point and an
// outward unit direction (in local meters). A cap vertex lies on the far
// (outward) side of one of these lines; the offset curve's true endpoint lies
// on the line (outward component ~0) and is kept.
function getOpenPathTerminals(srcShape, iter, spherical) {
  var terminals = [];
  (srcShape || []).forEach(function(part) {
    var pts = [];
    iter.init(part);
    while (iter.hasNext()) pts.push([iter.x, iter.y]);
    if (pts.length < 2) return;
    var closed = pts[0][0] === pts[pts.length - 1][0] &&
      pts[0][1] === pts[pts.length - 1][1];
    if (closed) return; // closed rings have no caps
    terminals.push(makeTerminal(pts[0], pts[1], spherical));
    terminals.push(makeTerminal(pts[pts.length - 1], pts[pts.length - 2], spherical));
  });
  return terminals;
}

function makeTerminal(end, inner, spherical) {
  // outward = direction from the path interior toward the open end
  var v = toLocalMeters(end[0] - inner[0], end[1] - inner[1], end[1], spherical);
  var len = Math.hypot(v[0], v[1]) || 1;
  return {x: end[0], y: end[1], ox: v[0] / len, oy: v[1] / len};
}

function toLocalMeters(dx, dy, lat, spherical) {
  if (!spherical) return [dx, dy];
  var DEG = 111320, cosLat = Math.cos(lat * Math.PI / 180) || 1e-6;
  return [dx * DEG * cosLat, dy * DEG];
}

// Trim round-cap vertices from the ends of an offset run. Each end of the run
// is a cap tip near one path terminal; vertices beyond that terminal's
// perpendicular line are removed, leaving the offset curve ending square at
// the perpendicular offset of the path endpoint.
function trimCapVertices(coords, terminals, spherical) {
  if (!terminals.length || coords.length < 2) return coords;
  var EPS = 1e-6; // meters
  function beyond(pt, term) {
    var v = toLocalMeters(pt[0] - term.x, pt[1] - term.y, term.y, spherical);
    return v[0] * term.ox + v[1] * term.oy > EPS;
  }
  function nearest(pt) {
    var best = null, bestD = Infinity;
    terminals.forEach(function(term) {
      var v = toLocalMeters(pt[0] - term.x, pt[1] - term.y, term.y, spherical);
      var d = v[0] * v[0] + v[1] * v[1];
      if (d < bestD) { bestD = d; best = term; }
    });
    return best;
  }
  var lead = nearest(coords[0]);
  while (coords.length >= 2 && beyond(coords[0], lead)) coords.shift();
  var tail = nearest(coords[coords.length - 1]);
  while (coords.length >= 2 && beyond(coords[coords.length - 1], tail)) coords.pop();
  return coords;
}

function offsetLineLength(coords) {
  var sum = 0;
  for (var i = 1; i < coords.length; i++) {
    sum += Math.abs(coords[i][0] - coords[i - 1][0]) +
      Math.abs(coords[i][1] - coords[i - 1][1]);
  }
  return sum;
}

// Build the path "wall" line for the split pipeline. Open parts are extended
// past both ends along the terminal tangent so the wall reaches the buffer
// boundary through the round caps (closed rings need no extension). The
// extension marches outward until it clears the local buffer band (see
// extendToExitBuffer); the excess lies outside the buffer and is clipped by
// the topology.
function makePathWallFeature(shape, srcId, iter, distance, spherical) {
  var lines = [];
  (shape || []).forEach(function(part) {
    var pts = [];
    iter.init(part);
    while (iter.hasNext()) pts.push([iter.x, iter.y]);
    if (pts.length < 2) return;
    var closed = pts[0][0] === pts[pts.length - 1][0] &&
      pts[0][1] === pts[pts.length - 1][1];
    if (!closed) {
      // project once and extend each open end until it exits the buffer band
      var proj = pts.map(function(p) { return projectBufferPoint(p[0], p[1], spherical); });
      var segs = [];
      for (var i = 1; i < proj.length; i++) segs.push([proj[i - 1], proj[i]]);
      var startExt = extendToExitBuffer(proj[0], proj[1], segs, distance, spherical);
      var endExt = extendToExitBuffer(proj[proj.length - 1], proj[proj.length - 2],
        segs, distance, spherical);
      pts = [startExt].concat(pts, [endExt]);
    }
    lines.push(pts);
  });
  return {
    type: 'Feature',
    properties: {__bufsrc: srcId},
    geometry: {type: 'MultiLineString', coordinates: lines}
  };
}

// March outward from @endProj (away from @innerProj) until the tip is clearly
// outside the buffer band of @segs (all in projected/Mercator space), then
// return the tip as a lat/long [x, y]. Sealing the round end cap requires the
// wall to span the whole end region and exit the buffer; a fixed multiple of
// the radius leaves the cap unsealed where the path curves back near its end
// (the band there is deeper than one cap radius), which lets the front and
// back halves reconnect around the end. Overshoot is harmless -- a stray
// non-path arc that the divider flood crosses freely.
function extendToExitBuffer(endProj, innerProj, segs, distance, spherical) {
  var dx = endProj[0] - innerProj[0], dy = endProj[1] - innerProj[1];
  var len = Math.hypot(dx, dy) || 1;
  var ux = dx / len, uy = dy / len;
  var step = getLocalBufferDistance(endProj, distance, spherical);
  var L = step * 1.6, tip = [endProj[0] + ux * L, endProj[1] + uy * L];
  for (var i = 0; i < 256; i++) {
    var bd = getLocalBufferDistance(tip, distance, spherical);
    if (getPointToSegmentsDistance(tip, segs) > bd * 1.05) break;
    L += step;
    tip = [endProj[0] + ux * L, endProj[1] + uy * L];
  }
  return unprojectBufferPoint(tip[0], tip[1], spherical);
}

function useArtifactHoleFilter(opts) {
  return !opts.debug_offset && !opts.debug_mosaic;
}

// Remove artifact rings left by dissolving the self-intersecting outline rings
// made by the two-sided buffer fast path. The outline's concave-join loops can
// survive the dissolve as spurious holes (and, degenerately, as zero-area rings
// of either sign). True buffer boundaries lie at the buffer distance from the
// source path (within the error budget: presimplification interval + arc chord
// sag), so a hole is deleted when there is positive distance-based evidence
// that its entire region lies inside the true buffer, and kept otherwise.
// Filters one buffer shape (one source feature's dissolved outline); returns
// the filtered shape, or null if nothing survives.
function filterOutlineArtifactHolesFromShape(bufShape, bufArcs, srcShape,
    srcArcs, distance, intervalPct, sagPct, oneSided, sideOpts, spherical) {
  var sourceSegments = null;
  var sourceParts = null;
  var shape2 = (bufShape || []).filter(function(path) {
    var isHole = getPlanarPathArea(path, bufArcs) < 0;
    var points = getProjectedRingPoints(path, bufArcs, spherical);
    var scale = getLocalBufferDistance(points[0], 1, spherical);
    var projDist = distance * scale; // nominal buffer distance in projected units
    if (getRingArea(points) < (0.01 * projDist) * (0.01 * projDist)) {
      // degenerate sliver ring (either sign): always an artifact
      return false;
    }
    if (!isHole) return true;
    if (oneSided) {
      if (!sourceParts) {
        sourceParts = getSourcePathParts(srcShape, srcArcs, spherical);
      }
      return !holeIsOneSidedArtifact(points, sourceParts, distance,
        sideOpts, intervalPct, sagPct, spherical);
    }
    if (!sourceSegments) {
      sourceSegments = getSourceSegments(srcShape, srcArcs, spherical);
    }
    return !holeIsBufferArtifact(points, sourceSegments, distance,
      intervalPct, sagPct, spherical);
  });
  return shape2.length > 0 ? shape2 : null;
}

// Decide whether a dissolved hole is an artifact of the outline fast path.
// All distances are compared as fractions of the local buffer distance.
// - The interior of a real hole is, by definition, farther from the source
//   path than the buffer distance (less the presimplification interval),
//   so a probe inside the hole that measures >= (1 - interval) is proof
//   of a real hole.
// - A real hole's boundary lies at the buffer distance (less interval and
//   chord sag), so a hole whose entire boundary measures below that band
//   is an artifact, as is a hole whose interior probes all measure below
//   the real-hole minimum.
// Holes that cannot be resolved within the error budget are kept, except
// when their boundary dips below half the buffer distance (a signature of
// construction artifacts that real-hole boundaries cannot produce).
function holeIsBufferArtifact(points, sourceSegments, distance, intervalPct, sagPct, spherical) {
  var keepTol = 1 - intervalPct - 0.001; // interior at/above this = real hole
  var boundaryTol = 1 - intervalPct - sagPct - 0.001;
  var probes = getHoleInteriorProbes(points);
  var i, p, dNorm;
  var probeMax = -Infinity;
  for (i = 0; i < probes.length; i++) {
    dNorm = getNormalizedSourceDistance(probes[i], sourceSegments, distance, spherical);
    if (dNorm >= keepTol) return false; // evidence of a real hole
    if (dNorm > probeMax) probeMax = dNorm;
  }
  var step = Math.max(1, Math.floor(points.length / 200));
  var minNorm = Infinity, maxNorm = -Infinity;
  for (i = 0; i < points.length - 1; i += step) {
    p = points[i];
    dNorm = getNormalizedSourceDistance(p, sourceSegments, distance, spherical);
    if (dNorm < minNorm) minNorm = dNorm;
    if (dNorm > maxNorm) maxNorm = dNorm;
    // also sample the following edge's midpoint, to catch artifacts with
    // few vertices but long edges
    p = points[i + 1];
    dNorm = getNormalizedSourceDistance([(points[i][0] + p[0]) / 2,
      (points[i][1] + p[1]) / 2], sourceSegments, distance, spherical);
    if (dNorm < minNorm) minNorm = dNorm;
    if (dNorm > maxNorm) maxNorm = dNorm;
  }
  if (maxNorm < boundaryTol) return true; // boundary strictly inside the buffer
  if (probes.length > 0) return true; // all interior probes below the real-hole minimum
  return minNorm < 0.5; // no probes: fall back to the deep-dip signature
}

// One-sided counterpart of holeIsBufferArtifact(). A one-sided buffer is
// not a distance contour: the region is the union of each segment's band
// on the buffered side, the concave wedge sectors at vertices, and (for
// round caps) the half-disk wrapping the end of the traversal, so real
// holes can lie at any distance from the path (including against the path
// line itself). Instead of distances, samples are tested for coverage by
// that union, shrunk by the error budget: a point that is deeply covered
// must be inside the true buffer, so a hole whose interior probes are all
// deeply covered is an artifact, and one with any uncovered probe is real
// (a real hole's interior is outside the buffer by definition).
function holeIsOneSidedArtifact(points, sourceParts, distance, sideOpts, intervalPct, sagPct, spherical) {
  var probes = getHoleInteriorProbes(points);
  var i, p;
  for (i = 0; i < probes.length; i++) {
    if (!pointIsCoveredBySource(probes[i], sourceParts, distance, sideOpts,
        intervalPct, sagPct, spherical)) {
      return false; // evidence of a real hole
    }
  }
  if (probes.length > 0) return true;
  // no valid interior probes (degenerate ring): require the whole boundary
  // to be deeply covered
  var step = Math.max(1, Math.floor(points.length / 200));
  for (i = 0; i < points.length - 1; i += step) {
    p = [(points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2];
    if (!pointIsCoveredBySource(points[i], sourceParts, distance, sideOpts,
        intervalPct, sagPct, spherical) ||
        !pointIsCoveredBySource(p, sourceParts, distance, sideOpts,
        intervalPct, sagPct, spherical)) {
      return false;
    }
  }
  return true;
}

// Test if point p lies inside the true one-sided buffer region, shrunk by
// the error budget on every boundary: within (r - depth margin) of a
// segment with its perpendicular foot on the segment (at least a side
// margin onto the buffered side), or inside the join sector between two
// adjacent segments' perpendiculars at an interior vertex (the round-join
// fan at convex bends, the wedge at concave bends), or inside a round end
// cap's half-disk. Points outside the shrunken region report uncovered,
// so hole classification errs toward keeping holes and tile repair errs
// toward not adding tiles.
function pointIsCoveredBySource(p, sourceParts, distance, sideOpts, intervalPct, sagPct, spherical) {
  var rLocal = getLocalBufferDistance(p, distance, spherical);
  var depthMax = rLocal * (1 - intervalPct - sagPct - 0.001);
  var sideMin = rLocal * (intervalPct + 0.001);
  var side = sideOpts.side;
  var i, j, part, closed, a, b, abx, aby, apx, apy, den, len, t, leftDist;
  var ex, ey, distSq, bearing, bearingPrev, capVert, capPrev, fx, fy;
  for (i = 0; i < sourceParts.length; i++) {
    part = sourceParts[i];
    closed = part.length > 1 && part[0][0] === part[part.length - 1][0] &&
      part[0][1] === part[part.length - 1][1];
    bearingPrev = null;
    for (j = 1; j < part.length; j++) {
      a = part[j - 1];
      b = part[j];
      abx = b[0] - a[0];
      aby = b[1] - a[1];
      den = abx * abx + aby * aby;
      if (den === 0) continue;
      apx = p[0] - a[0];
      apy = p[1] - a[1];
      len = Math.sqrt(den);
      bearing = Math.atan2(abx, aby);
      leftDist = side * (abx * apy - aby * apx) / len;
      if (leftDist >= sideMin && leftDist <= depthMax) {
        t = (apx * abx + apy * aby) / den;
        if (t >= 0 && t <= 1) return true; // inside the segment's band
      }
      // join sector at the vertex between the previous and this segment:
      // covered if within radius of the vertex and angularly between the
      // two segments' buffered-side perpendiculars
      if (bearingPrev !== null &&
          (distSq = apx * apx + apy * apy) <= depthMax * depthMax &&
          pointInJoinSector(Math.atan2(apx, apy), bearingPrev, bearing, side,
            sideMin / Math.max(Math.sqrt(distSq), sideMin))) {
        return true;
      }
      bearingPrev = bearing;
    }
    if (closed && part.length > 2) {
      // closure vertex: sector between the last and first segments
      a = part[0];
      b = part[1];
      abx = b[0] - a[0];
      aby = b[1] - a[1];
      if (abx !== 0 || aby !== 0) {
        apx = p[0] - a[0];
        apy = p[1] - a[1];
        distSq = apx * apx + apy * apy;
        if (bearingPrev !== null && distSq <= depthMax * depthMax &&
            pointInJoinSector(Math.atan2(apx, apy), bearingPrev,
              Math.atan2(abx, aby), side,
              sideMin / Math.max(Math.sqrt(distSq), sideMin))) {
          return true;
        }
      }
    }
    if (sideOpts.roundCaps && !closed && part.length > 1) {
      // round cap half-disk at the end of the traversal (the start of the
      // path for right-side buffers, which traverse the path reversed)
      if (side === 1) {
        capVert = part[part.length - 1];
        capPrev = part[part.length - 2];
      } else {
        capVert = part[0];
        capPrev = part[1];
      }
      fx = capVert[0] - capPrev[0];
      fy = capVert[1] - capPrev[1];
      len = Math.sqrt(fx * fx + fy * fy);
      ex = p[0] - capVert[0];
      ey = p[1] - capVert[1];
      if (len > 0 && ex * ex + ey * ey <= depthMax * depthMax &&
          (ex * fx + ey * fy) / len >= sideMin) {
        return true;
      }
    }
  }
  return false;
}

// Test if the direction phi (radians, from a path vertex) falls within the
// joint coverage sector between the buffered-side perpendiculars of the
// two segments meeting at the vertex, shrunk by an angular margin: the
// short way around from one perpendicular to the other, which traverses
// the round-join fan at convex bends and the concave wedge at concave
// ones.
function pointInJoinSector(phi, bearing1, bearing2, side, angMargin) {
  var n1 = bearing1 - side * Math.PI / 2;
  var n2 = bearing2 - side * Math.PI / 2;
  var span = angleDelta2(n1, n2);
  var t = angleDelta2(n1, phi);
  if (span >= 0) {
    return t >= angMargin && t <= span - angMargin;
  }
  return t <= -angMargin && t >= span + angMargin;
}

function angleDelta2(a, b) {
  var d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function getSourcePathParts(shape, arcs, spherical) {
  var iter = new ShapeIter(arcs);
  return (shape || []).map(function(part) {
    var points = [];
    iter.init(part);
    while (iter.hasNext()) {
      points.push(projectBufferPoint(iter.x, iter.y, spherical));
    }
    return points;
  });
}

// Returns up to 12 points inside the ring, made by nudging edge midpoints
// inward by roughly half the ring's local thickness and verifying them
// with a point-in-ring test.
function getHoleInteriorProbes(points) {
  var area = getRingArea(points);
  var perim = getRingPerimeter(points);
  var nudge = perim > 0 ? area / perim : 0;
  var probes = [];
  var step = Math.max(1, Math.floor((points.length - 1) / 12));
  var i, a, b, mx, my, ex, ey, len, px, py;
  if (!(nudge > 0)) return probes;
  for (i = 0; i < points.length - 1 && probes.length < 12; i += step) {
    a = points[i];
    b = points[i + 1];
    ex = b[0] - a[0];
    ey = b[1] - a[1];
    len = Math.sqrt(ex * ex + ey * ey);
    if (!(len > 0)) continue;
    mx = (a[0] + b[0]) / 2;
    my = (a[1] + b[1]) / 2;
    // try both perpendicular directions; keep the one inside the ring
    px = mx - ey / len * nudge;
    py = my + ex / len * nudge;
    if (pointInRing(px, py, points)) {
      probes.push([px, py]);
    } else {
      px = mx + ey / len * nudge;
      py = my - ex / len * nudge;
      if (pointInRing(px, py, points)) probes.push([px, py]);
    }
  }
  return probes;
}

function getNormalizedSourceDistance(p, sourceSegments, distance, spherical) {
  var d = getPointToSegmentsDistance(p, sourceSegments);
  return d / getLocalBufferDistance(p, distance, spherical);
}

function getProjectedRingPoints(path, arcs, spherical) {
  var iter = new ShapeIter(arcs);
  var points = [];
  iter.init(path);
  while (iter.hasNext()) {
    points.push(projectBufferPoint(iter.x, iter.y, spherical));
  }
  return points;
}

function getRingArea(points) {
  var sum = 0;
  for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
  }
  return Math.abs(sum / 2);
}

function getRingPerimeter(points) {
  var sum = 0;
  for (var i = 1; i < points.length; i++) {
    sum += Math.sqrt((points[i][0] - points[i-1][0]) * (points[i][0] - points[i-1][0]) +
      (points[i][1] - points[i-1][1]) * (points[i][1] - points[i-1][1]));
  }
  return sum;
}

function pointInRing(x, y, points) {
  var inside = false;
  for (var i = 0, j = points.length - 1; i < points.length; j = i++) {
    if ((points[i][1] > y) !== (points[j][1] > y) &&
        x < (points[j][0] - points[i][0]) * (y - points[i][1]) /
          (points[j][1] - points[i][1]) + points[i][0]) {
      inside = !inside;
    }
  }
  return inside;
}

function getSourceSegments(shape, arcs, spherical) {
  var iter = new ShapeIter(arcs);
  var segments = [];
  (shape || []).forEach(function(part) {
    var prev = null;
    var p;
    iter.init(part);
    while (iter.hasNext()) {
      p = projectBufferPoint(iter.x, iter.y, spherical);
      if (prev) segments.push([prev, p]);
      prev = p;
    }
  });
  return indexSourceSegments(segments);
}

// Consecutive source segments are spatially coherent (they trace a path), so
// grouping them into fixed-size chunks with bounding boxes lets a point-to-path
// distance query skip whole groups that are already farther than the closest
// segment found so far. A single buffered shape's source path can have many
// thousands of segments, and the artifact-hole filter measures the source
// distance for every probe and boundary sample of every candidate hole, so the
// naive all-segments scan dominated large buffers.
var SOURCE_SEGMENT_CHUNK_SIZE = 32;

function indexSourceSegments(segments) {
  var chunks = [];
  for (var i = 0; i < segments.length; i += SOURCE_SEGMENT_CHUNK_SIZE) {
    var end = Math.min(i + SOURCE_SEGMENT_CHUNK_SIZE, segments.length);
    var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (var j = i; j < end; j++) {
      var a = segments[j][0], b = segments[j][1];
      if (a[0] < xmin) xmin = a[0];
      if (a[0] > xmax) xmax = a[0];
      if (b[0] < xmin) xmin = b[0];
      if (b[0] > xmax) xmax = b[0];
      if (a[1] < ymin) ymin = a[1];
      if (a[1] > ymax) ymax = a[1];
      if (b[1] < ymin) ymin = b[1];
      if (b[1] > ymax) ymax = b[1];
    }
    chunks.push({start: i, end: end, xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax});
  }
  return {segments: segments, chunks: chunks};
}

function getLocalBufferDistance(p, distance, spherical) {
  return spherical ? distance / Math.cos(Math.atan(Math.sinh(p[1] / R))) : distance;
}

function projectBufferPoint(x, y, spherical) {
  return spherical ? [x * D2R * R, Math.log(Math.tan(Math.PI / 4 + y * D2R / 2)) * R] :
    [x, y];
}

function unprojectBufferPoint(x, y, spherical) {
  return spherical ? [x / (D2R * R), (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / (D2R)] :
    [x, y];
}

// Accepts either an indexed source ({segments, chunks}, from getSourceSegments)
// or a plain array of [a, b] segments (small ad-hoc lists, e.g. cap regions).
function getPointToSegmentsDistance(p, src) {
  if (src.chunks) return getPointToIndexedSegmentsDistance(p, src);
  var minSq = Infinity;
  var distSq;
  for (var i = 0; i < src.length; i++) {
    distSq = getPointToSegmentDistanceSq(p, src[i][0], src[i][1]);
    if (distSq < minSq) minSq = distSq;
  }
  return Math.sqrt(minSq);
}

// Same result as scanning every segment, but with a bounding-box prefilter.
// A chunk's box distance is a lower bound on the distance to any of its
// segments, so a chunk whose box is farther than the closest segment found so
// far cannot contain a closer one and is skipped. We first scan the chunk with
// the nearest box to seed a tight bound (so the prune is effective regardless
// of where along the path the point lies), then prune the rest. No per-query
// allocation or sorting.
function getPointToIndexedSegmentsDistance(p, src) {
  var chunks = src.chunks, segments = src.segments;
  var px = p[0], py = p[1];
  var n = chunks.length;
  var bestSq = Infinity;
  var nearIdx = -1, nearBoxSq = Infinity, boxSq;
  for (var c = 0; c < n; c++) {
    boxSq = segmentChunkBoxDistSq(px, py, chunks[c]);
    if (boxSq < nearBoxSq) { nearBoxSq = boxSq; nearIdx = c; }
  }
  if (nearIdx >= 0) bestSq = scanSegmentChunk(px, py, segments, chunks[nearIdx], bestSq);
  for (var k = 0; k < n; k++) {
    if (k === nearIdx) continue;
    if (segmentChunkBoxDistSq(px, py, chunks[k]) >= bestSq) continue;
    bestSq = scanSegmentChunk(px, py, segments, chunks[k], bestSq);
  }
  return Math.sqrt(bestSq);
}

function scanSegmentChunk(px, py, segments, chunk, bestSq) {
  for (var i = chunk.start; i < chunk.end; i++) {
    var distSq = getPointToSegmentDistanceSq2(px, py, segments[i][0], segments[i][1]);
    if (distSq < bestSq) bestSq = distSq;
  }
  return bestSq;
}

// Min squared distance from point (px, py) to a chunk's bounding box; 0 inside.
function segmentChunkBoxDistSq(px, py, chunk) {
  var dx = px < chunk.xmin ? chunk.xmin - px : (px > chunk.xmax ? px - chunk.xmax : 0);
  var dy = py < chunk.ymin ? chunk.ymin - py : (py > chunk.ymax ? py - chunk.ymax : 0);
  return dx * dx + dy * dy;
}

function getPointToSegmentDistanceSq2(px, py, a, b) {
  var dx = b[0] - a[0];
  var dy = b[1] - a[1];
  var qx = px - a[0];
  var qy = py - a[1];
  var den = dx * dx + dy * dy;
  var t = den ? (qx * dx + qy * dy) / den : 0;
  var ex, ey;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  ex = qx - t * dx;
  ey = qy - t * dy;
  return ex * ex + ey * ey;
}

function getPointToSegmentDistanceSq(p, a, b) {
  var dx = b[0] - a[0];
  var dy = b[1] - a[1];
  var qx = p[0] - a[0];
  var qy = p[1] - a[1];
  var den = dx * dx + dy * dy;
  var t = den ? (qx * dx + qy * dy) / den : 0;
  var ex, ey;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  ex = qx - t * dx;
  ey = qy - t * dy;
  return ex * ex + ey * ey;
}

export function makeShapeBufferGeoJSON(lyr, dataset, opts) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var makerOpts = Object.assign({geometry_type: lyr.geometry_type}, opts);
  var makeShapeBuffer = getPolylineBufferMaker(dataset, makerOpts);
  var arr = [];
  lyr.shapes.forEach(function(shape, i) {
    var distance = distanceFn(i);
    var retn;
    if (!distance || !shape) return;
    // retn might be an array of features or a single feature
    retn = makeShapeBuffer(shape, distance);
    if (Array.isArray(retn)) {
      arr.push.apply(arr, retn);
    } else if (retn) {
      arr.push(retn);
    }
  });
  return getBufferGeoJSON(arr);
}

function tagSource(feature, srcId) {
  if (feature && feature.type == 'Feature') {
    feature.properties = Object.assign({}, feature.properties, {__bufsrc: srcId});
  }
}

function makePathFeature(shape, srcId, iter) {
  var lines = (shape || []).map(function(part) {
    var pts = [];
    iter.init(part);
    while (iter.hasNext()) pts.push([iter.x, iter.y]);
    return pts;
  });
  return {
    type: 'Feature',
    properties: {__bufsrc: srcId},
    geometry: {type: 'MultiLineString', coordinates: lines}
  };
}

function getBufferGeoJSON(arr) {
  var geojsonType = arr?.[0].type;
  // TODO: make sure that importer supports null geometries (not standard GeoJSON);
  return geojsonType == 'Feature' ? {
    type: 'FeatureCollection',
    features: arr
  } : {
    type: 'GeometryCollection',
    geometries: arr
  };
}

export function splitAntimeridianBufferDataset(dataset) {
  var lyr = dataset.layers[0];
  var bounds;
  if (!lyr || lyr.geometry_type != 'polygon' || !dataset.arcs) return;
  bounds = getLayerBounds(lyr, dataset.arcs);
  if (bounds.xmin >= -180 && bounds.xmax <= 180) return;
  var editor = new DatasetEditor(dataset);
  dataset.layers.forEach(function(lyr2) {
    if (lyr2.geometry_type == 'polygon') {
      editor.editLayer(lyr2, splitAntimeridianRing);
    } else if (lyr2.geometry_type == 'point') {
      editor.editLayer(lyr2, wrapPointCoords);
    } else {
      editor.editLayer(lyr2, function(coords) { return coords; });
    }
  });
  editor.done();
}

function splitAntimeridianRing(ring) {
  ring = wrapRingLongitudes(ring);
  return countCrosses(ring) > 0 ? removePolygonCrosses([ring]) : [ring];
}

function wrapPointCoords(p) {
  return [wrapLongitude(p[0]), p[1]];
}

function wrapRingLongitudes(ring) {
  return ring.map(function(p) {
    return [wrapLongitude(p[0]), p[1]];
  });
}

function wrapLongitude(lng) {
  while (lng < -180) lng += 360;
  while (lng > 180) lng -= 360;
  return lng;
}
