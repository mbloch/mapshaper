import Delaunator from 'delaunator';
import Visvalingam from '../simplify/mapshaper-visvalingam';
import { pointSegDistSq2 } from '../geom/mapshaper-basic-geom';
import { profileStart, profileEnd, profileEnabled } from '../utils/mapshaper-profile';
import { message } from '../utils/mapshaper-logging';

// Build approximate inter-feature Voronoi (medial-axis) cut lines for the
// topological polygon buffer. Where two features' buffers overlap, the
// contested space should be partitioned by proximity to the source polygons;
// the locus of points equidistant from two sources is a generalized Voronoi
// boundary. We approximate it by sampling points along the source rings (one
// label per feature) and emitting the dual Voronoi edges that separate sites of
// different features.
//
// The returned lines are injected into the buffer mosaic as cut-lines: they
// subdivide each contested tile along the equidistant boundary, and any portion
// lying outside the buffers is pruned by the mosaic builder (detachAcyclicArcs).
// Only the boundary between two features' final regions survives the per-feature
// tile dissolve.
//
// @coordDistances: per-feature buffer distance in source-coordinate units (the
// caller converts from meters via getCoordinateDistance), used both as the
// densification scale and as the proximity prune (two sites can only be jointly
// contested if they are within the sum of their features' radii).

// Baseline cap used to derive the spacing floor totalLen/MAX_SITES. On small
// inputs this floor sits well below the buffer distance and adaptive sampling
// works; it is the floor that keeps simple mosaics stable.
var MAX_SITES = 60000;

// The spacing floor is also capped at FLOOR_DISTANCE_FRACTION of the buffer
// distance. On a large mosaic totalLen/MAX_SITES grows until it approaches (or
// exceeds) the buffer distance, which flattens the floor onto maxSpacing and
// disables adaptive densification -- so the narrowest channels (a river between
// two states) zig-zag. Capping the floor at a fraction of the buffer distance
// guarantees adaptive headroom regardless of input size. The value matches the
// floor/maxSpacing ratio at which small mosaics already sample cleanly.
var FLOOR_DISTANCE_FRACTION = 0.1;

// Soft target total site count. coarsen scales the gap-proportional spacing up
// until the predicted total falls under this, keeping the Delaunay bounded on
// dense shared-border mosaics while leaving sparse inputs at coarsen=1 (fully
// adaptive). Set above the site counts of typical large inputs so those stay
// fully resolved.
var SITE_BUDGET = 800000;

export function buildInterFeatureMedialLines(shapes, coordDistances, arcs, opts) {
  opts = opts || {};
  profileStart('medial:collectSites');
  var sites = collectSites(shapes, coordDistances, arcs);
  profileEnd('medial:collectSites');
  if (!sites || sites.coords.length < 3) return null;
  if (profileEnabled()) {
    message('[medial] sample sites: ' + sites.coords.length);
  }
  profileStart('medial:computeSegments');
  var medial = computeMedialSegments(sites, coordDistances, sites.grid);
  profileEnd('medial:computeSegments');
  if (medial.segments.length === 0) return null;
  // Stitch the individual Voronoi edges (2-point segments that meet at shared
  // circumcenters) into maximal polylines so the medial axis can be simplified
  // and injected as connected paths rather than a swarm of tiny stubs.
  profileStart('medial:assembleChains');
  var chains = assembleChains(medial.segments, medial.coords);
  profileEnd('medial:assembleChains');
  if (opts.simplifyInterval > 0) {
    profileStart('medial:simplify');
    chains = chains.map(function(chain) {
      return simplifyChain(chain, opts.simplifyInterval);
    });
    profileEnd('medial:simplify');
  }
  // Extend each chain's endpoints outward along their terminal tangent. A medial
  // chain is a cut-line: it only subdivides a contested buffer tile if it spans
  // from boundary to boundary, so the mosaic builder keeps it (an end that
  // terminates in a tile's interior is acyclic and detachAcyclicArcs prunes the
  // whole path). The sampled-site Voronoi stops a fraction of the site spacing
  // short of where two source rings meet (the gap pinches shut), leaving that end
  // dangling INSIDE the buffer. Extending past the source boundary lets the cut
  // node against it; the overshoot lands outside the contested region and is
  // self-pruned. Without this, a whole river-gap tile is left uncut and assigned
  // wholesale to one feature (e.g. the Columbia between Oregon and Washington).
  var extendDist = 0;
  for (var di = 0; di < coordDistances.length; di++) {
    if (coordDistances[di] > extendDist) extendDist = coordDistances[di];
  }
  if (extendDist > 0) {
    chains = chains.map(function(chain) {
      return extendChainEndpoints(chain, extendDist);
    });
  }
  return {
    type: 'MultiLineString',
    coordinates: chains
  };
}

// Extend an open chain past both endpoints by @len along the direction of the
// terminal segment (so the cut-line pokes out of the contested tile at each end
// and nodes against the enclosing boundary). Zero-length terminal segments and
// chains shorter than 2 points are left unchanged.
function extendChainEndpoints(chain, len) {
  if (!chain || chain.length < 2) return chain;
  var out = chain.concat();
  var head = projectPast(out[0], out[1], len);
  if (head) out.unshift(head);
  var n = out.length;
  var tail = projectPast(out[n - 1], out[n - 2], len);
  if (tail) out.push(tail);
  return out;
}

// Point at distance @len beyond @from, going away from @toward (i.e. continuing
// the from->beyond ray that the toward->from segment defines). Returns null for a
// degenerate (coincident) segment.
function projectPast(from, toward, len) {
  var dx = from[0] - toward[0];
  var dy = from[1] - toward[1];
  var d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) return null;
  return [from[0] + dx / d * len, from[1] + dy / d * len];
}

// Build the medial-construction triangles for the -buffer debug-delaunay option
// as a GeometryCollection of triangle polygons. collectSites returns only the
// contested sites, so the Delaunay is already the per-region mesh from which the
// medial axis is derived; this keeps the triangles whose circumcenter is an
// actual medial vertex. A triangle qualifies when it has a cross-feature edge
// within buffer reach AND its circumcenter lies inside the overlap
// (circumradius <= reach). The second test drops the long, thin triangles that
// span a ribbon's concave bends: their circumcenters are wild and the medial
// computation discards their segments, so showing them would just add spurious
// spans. Returns null when nothing bridges two features.
export function buildInterFeatureDelaunay(shapes, coordDistances, arcs) {
  var sites = collectSites(shapes, coordDistances, arcs);
  if (!sites || sites.coords.length < 3) return null;
  var coords = sites.coords;
  var owner = sites.owner;
  var triangles = Delaunator.from(coords).triangles;
  var geometries = [];
  for (var i = 0; i < triangles.length; i += 3) {
    var ia = triangles[i], ib = triangles[i + 1], ic = triangles[i + 2];
    var reach = Math.max(
      bridgingReach(ia, ib, coords, owner, coordDistances),
      bridgingReach(ib, ic, coords, owner, coordDistances),
      bridgingReach(ic, ia, coords, owner, coordDistances));
    if (reach <= 0) continue; // no contested edge
    var a = coords[ia], b = coords[ib], c = coords[ic];
    var cc = circumcenter(a, b, c);
    if (!cc) continue; // degenerate (near-collinear)
    var rx = cc[0] - a[0], ry = cc[1] - a[1];
    if (rx * rx + ry * ry > reach * reach) continue; // wild circumcenter
    geometries.push({
      type: 'Polygon',
      coordinates: [[
        [a[0], a[1]], [b[0], b[1]], [c[0], c[1]], [a[0], a[1]]
      ]]
    });
  }
  if (geometries.length === 0) return null;
  return {type: 'GeometryCollection', geometries: geometries};
}

// Buffer reach (sum of the two source radii) of edge (i, j) if its endpoints are
// different features and close enough for their buffers to overlap -- the same
// test computeMedialSegments uses to decide whether an edge's bisector is a
// contested medial edge. Returns 0 when the edge does not bridge features.
function bridgingReach(i, j, coords, owner, coordDistances) {
  if (owner[i] === owner[j]) return 0;
  var dx = coords[i][0] - coords[j][0];
  var dy = coords[i][1] - coords[j][1];
  var reach = coordDistances[owner[i]] + coordDistances[owner[j]];
  return Math.sqrt(dx * dx + dy * dy) <= reach ? reach : 0;
}

// Stitch 2-point medial segments into maximal polylines. The medial network is
// a graph whose vertices are the Delaunay triangles' circumcenters: every
// segment endpoint is a vertex id indexing @coords, so adjacent edges that meet
// at a shared circumcenter share an id directly -- no coordinate hashing needed.
// Degree-2 vertices lie mid-path; degree-1 (hull-ray ends) and degree-3+ (where
// 3+ features meet) vertices are junctions. Each returned chain runs between two
// junctions (or around an isolated loop).
function assembleChains(segments, coords) {
  var nodes = new Array(coords.length);
  function getNode(id) {
    var n = nodes[id];
    if (!n) { n = nodes[id] = {coord: coords[id], edges: []}; }
    return n;
  }
  var edges = segments.map(function(seg) {
    var a = getNode(seg[0]);
    var b = getNode(seg[1]);
    var edge = {a: a, b: b, used: false};
    a.edges.push(edge);
    b.edges.push(edge);
    return edge;
  });
  function other(edge, node) {
    return edge.a === node ? edge.b : edge.a;
  }
  function walk(start, firstEdge) {
    var chain = [start.coord];
    var node = start;
    var edge = firstEdge;
    while (true) {
      edge.used = true;
      node = other(edge, node);
      chain.push(node.coord);
      if (node.edges.length !== 2) break; // junction or dangling end
      var next = node.edges[0] === edge ? node.edges[1] : node.edges[0];
      if (next.used) break; // closed loop back to start
      edge = next;
    }
    return chain;
  }
  var chains = [];
  // Chains anchored at junctions / dangling ends first...
  for (var id = 0; id < nodes.length; id++) {
    var node = nodes[id];
    if (!node || node.edges.length === 2) continue;
    node.edges.forEach(function(edge) {
      if (!edge.used) chains.push(walk(node, edge));
    });
  }
  // ...then any remaining all-degree-2 loops.
  edges.forEach(function(edge) {
    if (!edge.used) chains.push(walk(edge.a, edge));
  });
  return chains;
}

// Weighted-Visvalingam simplifier shared across chains. Its internal heap and
// scratch buffers are reused per call, so a single instance is safe for the
// sequential per-chain calls below.
var medialSimplifier = Visvalingam.getWeightedSimplifier({}, false);

// Smooth a medial polyline with weighted Visvalingam, dropping vertices whose
// effective area (expressed as a linear-equivalent by scaledSimplify) falls
// below @interval. Endpoints carry an Infinity threshold and are always kept.
function simplifyChain(points, interval) {
  var n = points.length;
  if (n < 3) return points;
  var xx = new Float64Array(n);
  var yy = new Float64Array(n);
  var kk = new Float64Array(n);
  for (var i = 0; i < n; i++) {
    xx[i] = points[i][0];
    yy[i] = points[i][1];
  }
  medialSimplifier(kk, xx, yy);
  var out = [];
  for (i = 0; i < n; i++) {
    if (kk[i] >= interval) out.push(points[i]);
  }
  return out.length >= 2 ? out : [points[0], points[n - 1]];
}

// Boundary sample spacing as a fraction of the local gap width: smaller gives a
// smoother medial axis (more sites) in narrow channels. 0.5 keeps the spacing
// at most half the gap, so a channel of width w has at least two samples per
// bank across it.
var GAP_FACTOR = 0.5;

// Gaps narrower than this fraction of the buffer distance are treated as
// "touching" (at or below the buffer's positional tolerance, ~1%): no medial is
// densified there, since the shared source boundary already partitions the
// overlap. This keeps coincident mosaic borders from flooding the triangulation
// with collinear sites while leaving real channels (the Columbia is ~3% of the
// buffer distance) fully sampled.
var TOUCHING_GAP_FRACTION = 0.002;

// Boundary arcs that could bound a gap, found from the layer topology: in a
// shared-arc polygon mosaic an interior border between two features is one arc
// used once forward and once reversed, so the source boundary already
// partitions any buffer overlap there and it needs no medial. An arc used in
// only one direction is an external boundary, an inlet edge, or a hole edge --
// the only places a gap can be. Pruning the shared borders here drops the bulk
// of a dense mosaic (most county/state borders are shared) before any distance
// work; keptSites' distance test still separates the real gaps from the open
// external boundary, so inputs whose coincident borders are NOT shared arcs
// (each polygon carries its own copy) still come out correct, just less pruned.
// Returns one open path per candidate arc, tagged with its owner feature.
function collectCandidateArcPaths(shapes, coordDistances, arcs) {
  var n = arcs.size();
  var fwd = new Int32Array(n).fill(-1);
  var rev = new Int32Array(n).fill(-1);
  for (var s = 0; s < shapes.length; s++) {
    var shape = shapes[s];
    if (!shape || !(coordDistances[s] > 0)) continue;
    for (var p = 0; p < shape.length; p++) {
      var ids = shape[p];
      for (var k = 0; k < ids.length; k++) {
        var id = ids[k];
        if (id < 0) { if (rev[~id] === -1) rev[~id] = s; }
        else if (fwd[id] === -1) fwd[id] = s;
      }
    }
  }
  var paths = [];
  for (var i = 0; i < n; i++) {
    var f = fwd[i], r = rev[i];
    if (f === -1 && r === -1) continue; // arc not used by a buffered feature
    if (f !== -1 && r !== -1) continue; // shared interior border -- not a gap
    var pts = arcCoords(arcs, i);
    if (pts.length >= 2) paths.push({owner: f !== -1 ? f : r, points: pts});
  }
  return paths;
}

function arcCoords(arcs, arcId) {
  var iter = arcs.getArcIter(arcId);
  var pts = [];
  while (iter.hasNext()) pts.push([iter.x, iter.y]);
  return pts;
}

// Gather labeled Voronoi sites from the gap-candidate boundary arcs (see
// collectCandidateArcPaths) of the buffered features.
//
// Those arcs are sampled adaptively: where two features run close together
// (e.g. the opposite banks of a narrow river) the boundary is sampled finely so
// the medial axis tracks the channel centerline instead of zigzagging between
// the banks; where features are far apart the spacing relaxes to the buffer
// distance. The local gap width is measured directly to the candidate boundary
// segments (computeVertexGaps), driving the densification in a single pass.
function collectSites(shapes, coordDistances, arcs) {
  if (!arcs) return null;
  var paths = collectCandidateArcPaths(shapes, coordDistances, arcs);
  if (paths.length < 2) return null;

  // Assign every candidate vertex a stable id (vid) so a per-vertex gap can be
  // looked up while densifying its segments.
  var verts = buildVertexLayout(paths);
  if (verts.count < 2) return null;
  var totalLen = ringsLength(paths.map(function(p) { return p.points; }));
  // Spacing floor: totalLen/MAX_SITES is the simple-mosaic floor (keeps small
  // inputs stable and near-coincident borders from over-sampling), but it is
  // capped at a fraction of the buffer distance so a large mosaic keeps adaptive
  // headroom instead of flattening onto maxSpacing. When the cap binds, fitCoarsen
  // is what bounds the actual site total.
  var maxDistance = 0;
  for (var ci = 0; ci < coordDistances.length; ci++) {
    if (coordDistances[ci] > maxDistance) maxDistance = coordDistances[ci];
  }
  var spacingFloor = Math.min(totalLen / MAX_SITES,
    maxDistance * FLOOR_DISTANCE_FRACTION);

  // Sample spacing is proportional to the local gap (gap * GAP_FACTOR * coarsen),
  // floored at spacingFloor and capped at the buffer distance, so the narrowest
  // channels (a river between two states) get the finest sampling and wide
  // overlaps the coarsest. coarsen scales the whole distribution up just enough
  // to fit the site budget on dense mosaics (counties), keeping narrow channels
  // proportionally finer than wide ones; on sparse inputs it stays 1 (fully
  // adaptive). The per-vertex gap is computed directly from the boundary geometry
  // in a single pass, then we densify once.
  var grid = buildSegmentGrid(verts, coordDistances);
  var gaps = computeVertexGaps(grid, verts, coordDistances);
  var coarsen = fitCoarsen(verts, gaps, coordDistances, spacingFloor);
  var sites = densifyVertices(verts, gaps, coordDistances, spacingFloor, coarsen);
  // Triangulate only the sites bordering a real gap. Its medial segments come
  // exclusively from cross-feature edges, and the well-shaped triangles that
  // bridge a gap have their apex within reach too (a far apex makes a thin
  // triangle whose wild circumcenter is filtered out, or a hull edge that is
  // extrapolated as an outward ray). Dropping the touching interior borders and
  // the no-feature coastline shrinks the one remaining Delaunay and avoids
  // building a redundant medial where the source boundary already partitions.
  var kept = keptSites(sites, grid, coordDistances);
  // Keep the segment grid with the sites so computeMedialSegments can re-measure
  // the true source gap when the sample-pair proximity test is too coarse.
  kept.grid = grid;
  return kept;
}

// Bucket every boundary segment into a uniform grid so the nearest cross-feature
// segment to an arbitrary point can be found by probing its 3x3 cell
// neighborhood. The cell equals the maximum reach (sum of the two largest buffer
// distances), so any in-reach segment is guaranteed to fall in that 3x3 window.
// Returns null when there is no positive reach. Reused for both the per-vertex
// gap (drives adaptive sampling) and the per-site keep test (gapAtPoint).
function buildSegmentGrid(verts, coordDistances) {
  var paths = verts.paths;
  var maxDist = 0;
  for (var d = 0; d < coordDistances.length; d++) {
    if (coordDistances[d] > maxDist) maxDist = coordDistances[d];
  }
  var cell = 2 * maxDist; // upper bound on any pair's reach
  if (!(cell > 0)) return null;
  var xmin = Infinity, ymin = Infinity, ymax = -Infinity;
  paths.forEach(function(path) {
    var pts = path.points;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i][0] < xmin) xmin = pts[i][0];
      if (pts[i][1] < ymin) ymin = pts[i][1];
      if (pts[i][1] > ymax) ymax = pts[i][1];
    }
  });
  // +1 cell index shift keeps probed -1 neighbors non-negative; rowSpan packs
  // (col, row) into a collision-free integer key.
  var rowSpan = Math.floor((ymax - ymin) / cell) + 3;
  function cellKey(cx, cy) { return (cx + 1) * rowSpan + (cy + 1); }
  function colOf(x) { return Math.floor((x - xmin) / cell); }
  function rowOf(y) { return Math.floor((y - ymin) / cell); }
  var seg = {x0: [], y0: [], x1: [], y1: [], feat: [], reach: []};
  var grid = new Map();
  paths.forEach(function(path) {
    var pts = path.points;
    var feat = path.owner;
    var reach = coordDistances[feat];
    for (var k = 0; k + 1 < pts.length; k++) {
      var ax = pts[k][0], ay = pts[k][1], bx = pts[k + 1][0], by = pts[k + 1][1];
      var idx = seg.feat.length;
      seg.x0.push(ax); seg.y0.push(ay); seg.x1.push(bx); seg.y1.push(by);
      seg.feat.push(feat); seg.reach.push(reach);
      var cxa = colOf(Math.min(ax, bx)), cxb = colOf(Math.max(ax, bx));
      var cya = rowOf(Math.min(ay, by)), cyb = rowOf(Math.max(ay, by));
      for (var gx = cxa; gx <= cxb; gx++) {
        for (var gy = cya; gy <= cyb; gy++) {
          var key = cellKey(gx, gy);
          var bucket = grid.get(key);
          if (bucket) bucket.push(idx); else grid.set(key, [idx]);
        }
      }
    }
  });
  return {seg: seg, grid: grid, cellKey: cellKey, colOf: colOf, rowOf: rowOf};
}

// The channel width at (x, y): distance to the nearest different-feature segment
// within their combined reach, or Infinity if none. Works for any point, not
// just original vertices, so a long edge whose endpoints are out of reach but
// whose middle crosses a gap is still measured correctly at the interior sites.
function gapAtPoint(ctx, x, y, feat, reachF) {
  return nearestCrossFeatureSegmentDist(x, y, feat, reachF, ctx.seg, ctx.grid,
    ctx.cellKey, ctx.colOf, ctx.rowOf, Infinity);
}

// Local gap at each original vertex (drives adaptive sampling, see
// segmentSpacing). Measuring straight to the boundary segments yields the true
// gap in a single pass, replacing the old triangulate -> estimate-gap ->
// re-densify refinement loop that existed only because a coarse sampling can't
// see a narrow gap (its nearest cross-feature SAMPLE is far).
function computeVertexGaps(ctx, verts, coordDistances) {
  profileStart('medial:segmentGaps');
  var gaps = filledArray(verts.count, Infinity);
  if (ctx) {
    verts.paths.forEach(function(path) {
      var pts = path.points;
      var vids = path.vids;
      var feat = path.owner;
      var reachF = coordDistances[feat];
      for (var k = 0; k < vids.length; k++) {
        var g = gapAtPoint(ctx, pts[k][0], pts[k][1], feat, reachF);
        if (g < gaps[vids[k]]) gaps[vids[k]] = g;
      }
    });
  }
  profileEnd('medial:segmentGaps');
  return gaps;
}

// Distance from (vx, vy) (owned by @feat, reach @reachF) to the nearest
// different-feature segment within their combined reach, or @best if none is
// closer. Probes the 3x3 grid-cell neighborhood (cell == max reach).
function nearestCrossFeatureSegmentDist(vx, vy, feat, reachF, seg, grid, cellKey,
    colOf, rowOf, best) {
  var cx = colOf(vx), cy = rowOf(vy);
  for (var gx = cx - 1; gx <= cx + 1; gx++) {
    for (var gy = cy - 1; gy <= cy + 1; gy++) {
      var bucket = grid.get(cellKey(gx, gy));
      if (!bucket) continue;
      for (var b = 0; b < bucket.length; b++) {
        var s = bucket[b];
        if (seg.feat[s] === feat) continue;
        var reach = reachF + seg.reach[s];
        var dsq = pointSegDistSq2(vx, vy, seg.x0[s], seg.y0[s], seg.x1[s], seg.y1[s]);
        if (dsq <= reach * reach) {
          var dist = Math.sqrt(dsq);
          if (dist < best) best = dist;
        }
      }
    }
  }
  return best;
}

// True when medial vertex c lies in the buffer overlap of features fp and fq:
// within fp's radius of an fp-owned source segment AND within fq's radius of an
// fq-owned source segment. Measured against the actual source segments via the
// grid, so it is correct regardless of how coarsely the banks were sampled --
// unlike the sample-pair distance, which overestimates the gap when the nearest
// samples on opposite banks are staggered or far from the true closest approach.
// Slack on each reach when rescuing a cross-feature edge whose sample endpoints
// fell outside the cheap proximity test. It absorbs the discretization of the
// medial graph near a pinch point: the connecting Voronoi edge is bounded by the
// site spacing (capped at the buffer distance), so a genuinely contested edge can
// run up to ~1.5x reach and its medial vertices can land a similar fraction
// outside the overlap. 1.3 covers the worst real case observed (~1.18) with
// headroom, while spurious edges between sites contested with *other* features
// miss by far more (>=1.5 or have no nearby source segment) and stay pruned.
var MEDIAL_OVERLAP_SLACK = 1.3;

function medialVertexInOverlap(ctx, c, fp, fq, rp, rq) {
  var sp = rp * MEDIAL_OVERLAP_SLACK, sq = rq * MEDIAL_OVERLAP_SLACK;
  return pointFeatureDistSq(ctx, c[0], c[1], fp) <= sp * sp &&
    pointFeatureDistSq(ctx, c[0], c[1], fq) <= sq * sq;
}

// Squared distance from (x, y) to the nearest segment owned by feature @feat,
// probing the 3x3 grid-cell neighborhood (cell == max reach, so any segment
// within a single feature's radius is in the window). Infinity if none.
function pointFeatureDistSq(ctx, x, y, feat) {
  var seg = ctx.seg, grid = ctx.grid;
  var cx = ctx.colOf(x), cy = ctx.rowOf(y);
  var best = Infinity;
  for (var gx = cx - 1; gx <= cx + 1; gx++) {
    for (var gy = cy - 1; gy <= cy + 1; gy++) {
      var bucket = grid.get(ctx.cellKey(gx, gy));
      if (!bucket) continue;
      for (var b = 0; b < bucket.length; b++) {
        var s = bucket[b];
        if (seg.feat[s] !== feat) continue;
        var d2 = pointSegDistSq2(x, y, seg.x0[s], seg.y0[s], seg.x1[s], seg.y1[s]);
        if (d2 < best) best = d2;
      }
    }
  }
  return best;
}

// Keep only the sites that border a real gap: a different feature within reach
// (finite gap) but farther than the touching threshold. These are the only sites
// that can shape the medial axis. Touching/coincident interior borders (gap ~ 0,
// the shared source boundary already partitions them) and the no-feature
// coastline (gap = Infinity) are dropped, so the Delaunay covers just the
// genuine gaps -- no triangulation is wasted on borders that need no medial.
// The gap is measured per site (not per vertex) so a long edge whose endpoints
// fall out of reach but whose middle crosses a gap keeps its interior points.
function keptSites(sites, ctx, coordDistances) {
  profileStart('medial:contested');
  var result = {coords: [], owner: [], origin: []};
  if (!ctx) {
    profileEnd('medial:contested');
    return result;
  }
  var coords = sites.coords, owner = sites.owner, origin = sites.origin;
  for (var i = 0; i < coords.length; i++) {
    var feat = owner[i];
    var reach = coordDistances[feat];
    var g = gapAtPoint(ctx, coords[i][0], coords[i][1], feat, reach);
    if (isFinite(g) && g > reach * TOUCHING_GAP_FRACTION) {
      result.coords.push(coords[i]);
      result.owner.push(feat);
      result.origin.push(origin[i]);
    }
  }
  profileEnd('medial:contested');
  return result;
}

function ringsLength(rings) {
  var sum = 0;
  rings.forEach(function(points) {
    for (var i = 1; i < points.length; i++) {
      var dx = points[i][0] - points[i - 1][0];
      var dy = points[i][1] - points[i - 1][1];
      sum += Math.sqrt(dx * dx + dy * dy);
    }
  });
  return sum;
}

function filledArray(n, v) {
  var a = new Float64Array(n);
  a.fill(v);
  return a;
}

// Flatten the candidate arc paths into a vertex layout: one entry per path
// carrying its owner feature, its points, and a stable id (vid) for each vertex,
// so densifyVertices can re-sample using a per-vid gap estimate. Each candidate
// arc is an open polyline (every coordinate is a vertex, no wrap-around); a
// closed ring made of a single arc arrives with its first point repeated at the
// end, so treating it as open still covers the full loop.
function buildVertexLayout(paths) {
  var layout = [];
  var count = 0;
  paths.forEach(function(path) {
    var points = path.points;
    var m = points.length;
    if (m < 2) return;
    var vids = [];
    for (var i = 0; i < m; i++) vids.push(count++);
    layout.push({owner: path.owner, points: points, vids: vids});
  });
  return {paths: layout, count: count};
}

// The spacing for a path segment: the tighter of its two endpoints' gap-derived
// spacings (so a segment straddling a narrowing gap samples at the finer rate).
function segmentSpacing(path, k, gaps, maxSpacing, spacingFloor, coarsen) {
  var sA = spacingFromGap(gaps[path.vids[k]], maxSpacing, spacingFloor, coarsen);
  var sB = spacingFromGap(gaps[path.vids[k + 1]], maxSpacing, spacingFloor, coarsen);
  return Math.min(sA, sB);
}

// Re-sample every candidate path: emit each original vertex (tagged with its
// vid) plus interior points spaced by the local gap-derived spacing (see
// segmentSpacing). Paths are open, so the last vertex has no following segment.
// Long edges are densified even where their endpoints are out of reach, so a
// contested middle is sampled; keptSites later prunes the points that turn out
// not to border a real gap.
function densifyVertices(verts, gaps, coordDistances, spacingFloor, coarsen) {
  var coords = [];
  var owner = [];
  var origin = []; // vid for original vertices, -1 for interpolated points
  verts.paths.forEach(function(path) {
    var maxSpacing = coordDistances[path.owner];
    var m = path.vids.length;
    for (var k = 0; k < m; k++) {
      var a = path.points[k];
      coords.push([a[0], a[1]]);
      owner.push(path.owner);
      origin.push(path.vids[k]);
      if (k + 1 >= m) continue; // open path: no segment past the last vertex
      var b = path.points[k + 1];
      var s = segmentSpacing(path, k, gaps, maxSpacing, spacingFloor, coarsen);
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.sqrt(dx * dx + dy * dy);
      if (s > 0 && len > s) {
        var steps = Math.floor(len / s);
        for (var t = 1; t <= steps; t++) {
          var f = t / (steps + 1);
          coords.push([a[0] + dx * f, a[1] + dy * f]);
          owner.push(path.owner);
          origin.push(-1);
        }
      }
    }
  });
  return {coords: coords, owner: owner, origin: origin};
}

function spacingFromGap(gap, maxSpacing, spacingFloor, coarsen) {
  if (!isFinite(gap)) return maxSpacing;
  // A gap at or below the buffer's positional tolerance means the two features
  // effectively touch: there is no contested channel to run a medial down, and
  // the shared source boundary already partitions the overlap. Densifying it
  // would only flood a coincident border with collinear sites (millions of them
  // on a clean topological mosaic), so leave it at the coarse spacing.
  if (gap < maxSpacing * TOUCHING_GAP_FRACTION) return maxSpacing;
  var s = gap * GAP_FACTOR * coarsen;
  if (s > maxSpacing) s = maxSpacing;
  if (s < spacingFloor) s = spacingFloor;
  return s;
}

// Predicted total site count for a given coarsen, matching densifyVertices'
// emission rule exactly (one site per original vertex plus floor(len/spacing)
// interior points per segment). Pure counting, no Delaunay -- cheap enough to
// binary-search coarsen against. Counts pre-keep sites (the densification work),
// which is what coarsen actually bounds.
function predictSiteCount(verts, gaps, coordDistances, spacingFloor, coarsen) {
  var total = verts.count; // every original vertex is emitted
  verts.paths.forEach(function(path) {
    var maxSpacing = coordDistances[path.owner];
    var m = path.vids.length;
    for (var k = 0; k + 1 < m; k++) {
      var s = segmentSpacing(path, k, gaps, maxSpacing, spacingFloor, coarsen);
      var a = path.points[k];
      var b = path.points[k + 1];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.sqrt(dx * dx + dy * dy);
      if (s > 0 && len > s) total += Math.floor(len / s);
    }
  });
  return total;
}

// Smallest coarsen (>= 1) whose predicted site count fits SITE_BUDGET. Site
// count decreases monotonically as coarsen grows (spacing widens), so binary
// search converges; capped because near-coincident gaps (gap ~ 0) can't be
// thinned by coarsen and are bounded by spacingFloor instead.
function fitCoarsen(verts, gaps, coordDistances, spacingFloor) {
  if (predictSiteCount(verts, gaps, coordDistances, spacingFloor, 1) <= SITE_BUDGET) {
    return 1;
  }
  var lo = 1, hi = 1024;
  if (predictSiteCount(verts, gaps, coordDistances, spacingFloor, hi) > SITE_BUDGET) {
    return hi; // even fully coarsened we can't fit; accept the floor-bounded count
  }
  for (var i = 0; i < 20; i++) {
    var mid = (lo + hi) / 2;
    if (predictSiteCount(verts, gaps, coordDistances, spacingFloor, mid) > SITE_BUDGET) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

function nextHalfedge(e) {
  return e % 3 === 2 ? e - 2 : e + 1;
}

function triangleOfEdge(e) {
  return Math.floor(e / 3);
}

function computeMedialSegments(sites, coordDistances, ctx) {
  var coords = sites.coords;
  var owner = sites.owner;
  profileStart('medial:delaunay');
  var del = Delaunator.from(coords);
  profileEnd('medial:delaunay');
  var triangles = del.triangles;
  var halfedges = del.halfedges;
  var ntri = triangles.length / 3;
  // Medial-graph vertex coords, indexed by id. Triangle t's circumcenter is
  // vertex id t (so the three medial edges meeting at it share that id without
  // coordinate hashing); hull-ray ends are appended with fresh ids.
  var verts = new Array(ntri);
  var i;
  for (i = 0; i < ntri; i++) {
    verts[i] = circumcenter(
      coords[triangles[3 * i]],
      coords[triangles[3 * i + 1]],
      coords[triangles[3 * i + 2]]);
  }
  var segments = [];
  for (var e = 0; e < triangles.length; e++) {
    var opp = halfedges[e];
    var p = triangles[e];
    var q = triangles[nextHalfedge(e)];
    var fp = owner[p], fq = owner[q];
    if (fp === fq) continue;
    var dx = coords[p][0] - coords[q][0];
    var dy = coords[p][1] - coords[q][1];
    var siteDist = Math.sqrt(dx * dx + dy * dy);
    var rp = coordDistances[fp], rq = coordDistances[fq];
    var reach = rp + rq;
    var t1 = triangleOfEdge(e);
    var c1 = verts[t1];
    if (!c1) continue; // degenerate (near-collinear) triangle
    // Sites within the sum of their radii are accepted directly; this is the
    // common, cheap case. When they are farther apart, the bisector might still
    // be contested -- the nearest sample pair overestimates the true source gap
    // where banks are sampled coarsely or staggered. Re-measure the actual gap
    // at the medial vertex against the source segments (the grid) and rescue the
    // edge if it really lies in the buffer overlap. Without the rescue the medial
    // axis fragments at such spots, leaving the equidistant cut wall open so the
    // overlap face is never subdivided and a whole contested corridor is assigned
    // to one feature (a feature wrapping a neighbor's enclosed island).
    var near = siteDist <= reach;
    if (opp === -1) {
      if (!near && !(ctx && medialVertexInOverlap(ctx, c1, fp, fq, rp, rq))) continue;
      // Hull edge: the Voronoi edge here is an unbounded ray (the bisector of
      // two sites on the convex hull). Emit it as an outward ray from the
      // circumcenter so the medial line reaches and crosses the buffer
      // boundary -- otherwise an interior medial segment that ends at this
      // circumcenter would dangle inside a tile and be pruned, leaving no cut.
      // The excess outside the buffers is trimmed by detachAcyclicArcs.
      var third = coords[triangles[nextHalfedge(nextHalfedge(e))]];
      var end = outwardRayEnd(c1, coords[p], coords[q], third, reach);
      if (end) {
        var rayId = verts.length;
        verts.push(end);
        segments.push([t1, rayId]);
      }
      continue;
    }
    // interior edge: emit once (at the lower halfedge index)
    if (opp < e) continue;
    var t2 = triangleOfEdge(opp);
    var c2 = verts[t2];
    if (!c2) continue;
    if (!near && !(ctx &&
        (medialVertexInOverlap(ctx, c1, fp, fq, rp, rq) ||
         medialVertexInOverlap(ctx, c2, fp, fq, rp, rq)))) continue;
    var sx = c1[0] - c2[0], sy = c1[1] - c2[1];
    var segLen = Math.sqrt(sx * sx + sy * sy);
    // a real medial edge inside the overlap is short (on the order of the site
    // spacing plus the gap); a very long segment comes from a near-degenerate
    // triangle whose circumcenter is wild, so drop it
    if (segLen > 3 * (reach + siteDist)) continue;
    segments.push([t1, t2]);
  }
  return {segments: segments, coords: verts};
}

// Endpoint of the outward Voronoi ray for a hull edge (p, q) whose triangle's
// third vertex is @third: starts at the circumcenter @c, runs along the edge's
// perpendicular bisector, away from @third (outward), a length proportional to
// the buffer reach so it clears the buffer boundary.
function outwardRayEnd(c, p, q, third, reach) {
  var ex = q[0] - p[0], ey = q[1] - p[1];
  var nx = -ey, ny = ex; // a normal to the edge
  var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
  // orient the normal away from the third vertex (outward from the hull)
  if (nx * (mx - third[0]) + ny * (my - third[1]) < 0) {
    nx = -nx;
    ny = -ny;
  }
  var len = Math.sqrt(nx * nx + ny * ny);
  if (len === 0 || !isFinite(len)) return null;
  var L = 3 * reach;
  return [c[0] + nx / len * L, c[1] + ny / len * L];
}

function circumcenter(a, b, c) {
  var ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = c[0], cy = c[1];
  var d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (d === 0 || !isFinite(d)) return null;
  var a2 = ax * ax + ay * ay;
  var b2 = bx * bx + by * by;
  var c2 = cx * cx + cy * cy;
  var ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  var uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  if (!isFinite(ux) || !isFinite(uy)) return null;
  return [ux, uy];
}
