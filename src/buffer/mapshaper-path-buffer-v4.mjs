import { debug, stop } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';
import { ShapeIter } from '../paths/mapshaper-shape-iter';
import { BufferBuilder } from './mapshaper-buffer-builder';
import { bufferSegmentIntersection, getBufferSimplifyFunction } from './mapshaper-buffer-common';
import { removeBufferRingLoops, removeBufferRingLoopsByDirection, BUFFER_LOOP_WINDOW } from './mapshaper-buffer-loop-removal';
import DouglasPeucker from '../simplify/mapshaper-dp';
import { getDatasetCRS, isLatLngCRS } from '../crs/mapshaper-projections';
import { countCrosses, removePolygonCrosses } from '../geom/mapshaper-antimeridian-cuts';

import {
  getProjectingPathIterator,
  unprojectFeatures,
  getOffsetFunction } from './mapshaper-buffer-v4-utils';

import {
  bearingDegrees2D,
  getPlanarSegmentEndpoint
} from '../geom/mapshaper-geodesic';
import { distance2D, R2D, R } from '../geom/mapshaper-basic-geom';

var POLAR_BUFFER_MARGIN_DEGREES = 1e-4;


// Returns a function for generating GeoJSON MultiPolygon geometries
export function getPolylineBufferMaker(dataset, opts) {
  // var sliceLen = opts.slice_length || Infinity;
  var crs = getDatasetCRS(dataset);
  var useMercator = isLatLngCRS(crs);
  var getOffsetPoint = getOffsetFunction(crs, opts);
  var roundJoinSegsPerQuadrant = opts.quad_segs >= 2 ? opts.quad_segs : 8;
  var roundJoinSegAngle = 90 / roundJoinSegsPerQuadrant;
  var capStyle = opts.cap_style || 'round'; // expect 'round' or 'flat'
  var pathIter = useMercator ?
    getProjectingPathIterator(dataset.arcs, opts) : new ShapeIter(dataset.arcs);
  var latLngPathIter = useMercator ? new ShapeIter(dataset.arcs) : null;
  var builder = new BufferBuilder();
  var simplifyIntervalFn = getBufferSimplifyFunction(dataset, opts);
  var oneSidedBuffer = !!opts.left !== !!opts.right;

  function makeBufferGeoJSON(shape, distance) {
    var rings = [];
    if (useMercator && !opts.polar) {
      // With the polar option, the clamp pins offsets to the valid extent
      // instead of erroring near a pole (see getOffsetFunction / clampPolar).
      stopIfBufferReachesPole(shape, distance);
    }
    (shape || []).forEach(function(path, i) {
      var pathRings = makeSinglePathRings(path, distance);
      rings = rings.concat(pathRings);
    });
    if (rings.length === 0) return null;
    var features = [{
      type: 'Feature',
      properties: null,
      geometry: {
      type: 'MultiPolygon',
        // convert rings to MultiPolygon format
        coordinates: rings.map(ring => [ring])
      }
    }];
    if (useMercator) {
      unprojectFeatures(features, opts);
      if (opts.debug_offset) {
        splitAntimeridianCrosses(features);
      }
    }
    return features;
  }

  return makeBufferGeoJSON;

  function stopIfBufferReachesPole(shape, dist) {
    var maxAbsLat = 0;
    var angularDist = dist / R * R2D;
    (shape || []).forEach(function(path) {
      latLngPathIter.init(path);
      while (latLngPathIter.hasNext()) {
        maxAbsLat = Math.max(maxAbsLat, Math.abs(latLngPathIter.y));
      }
    });
    if (maxAbsLat + angularDist >= 90 - POLAR_BUFFER_MARGIN_DEGREES) {
      stop('Buffering lat-long coordinates near the poles is not supported; ' +
        'use the polar option for polygons sliced at the antimeridian/poles.');
    }
  }

  function splitAntimeridianCrosses(features) {
    features.forEach(function(feat) {
      var geom = feat.geometry;
      if (geom.type == 'Point') {
        geom.coordinates[0] = wrapLongitude(geom.coordinates[0]);
      } else if (geom.type == 'MultiPolygon') {
        geom.coordinates = splitMultiPolygonAtAntimeridian(geom.coordinates);
      }
    });
  }

  function splitMultiPolygonAtAntimeridian(coords) {
    var coords2 = [];
    coords.forEach(function(poly) {
      var rings = poly.map(wrapRingLongitudes);
      if (rings.some(ring => countCrosses(ring) > 0)) {
        rings = removePolygonCrosses(rings);
      }
      rings.forEach(function(ring) {
        coords2.push([ring]);
      });
    });
    return coords2;
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

  // each path may be converted into multiple buffer rings, which later
  // need to be dissolved
  // Re-anchor a closed ring [v0, v1, ..., v0] to the midpoint of its first edge:
  // returns [m, v1, ..., v0, m] where m = midpoint(v0, v1). The offset then
  // starts/ends mid-edge (a collinear seam) and v0 becomes an interior join.
  function startRingAtEdgeMidpoint(verts) {
    var a = verts[0], b = verts[1];
    var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    var out = [m];
    for (var i = 1; i < verts.length; i++) out.push(verts[i]);
    out.push(m.concat());
    return out;
  }

  function makeSinglePathRings(pathArcs, dist) {
    var rings = [];
    var pathSideVerts = collectPathVertices(pathArcs);
    var verts = pathSideVerts;
    if (simplifyIntervalFn) {
      verts = presimplifyPathVerts(verts, simplifyIntervalFn(dist), dist);
    }
    if (!oneSidedBuffer && !opts.band_method && pathIsOpen(verts)) {
      // Fast path for ordinary two-sided line buffers: emit one closed
      // outline instead of many per-segment bands that must be dissolved.
      // The band-method escape hatch skips it to fall through to the
      // per-segment band construction (makeLeftBufferRings, no winding fill).
      var built = makeTwoSidedOutlineRing(verts, dist);
      if (opts.no_loop_removal) return [built.ring];
      // Strip self-overlap loops (the dissolve would fill them anyway) so it has
      // fewer segments and self-intersections to resolve, while keeping real
      // holes. The two-sided outline of an open path has a consistent +/-1 base
      // winding, so the crossing-direction method classifies loops exactly from
      // the ring geometry alone; the source-turn gate is kept as an alternative.
      if (opts.loop_removal_turn_gate) {
        return [removeBufferRingLoops(built.ring, BUFFER_LOOP_WINDOW,
          built.srcPos, getSourceTurnPrefix(verts))];
      }
      return [removeBufferRingLoopsByDirection(built.ring, BUFFER_LOOP_WINDOW)];
    }
    if (!opts.right || opts.left) {
      rings = rings.concat(buildOneSidedRings(verts));
    }
    if (!opts.left || opts.right) {
      rings = rings.concat(buildOneSidedRings(verts.slice().reverse()));
    }
    return rings;

    // Build one offset side's rings, collapsing self-overlap overshoot loops in
    // each single winding-fill ring before the dissolve. The winding dissolve
    // (the dominant cost for polygon buffers) would fill these loops anyway, so
    // removing them up front cuts its self-intersection load; the source-turn
    // gate (via per-ring srcPos) keeps real buffer holes. Section-band mode
    // (no winding_fill) and the source-path edge get no provenance and pass
    // through unchanged.
    //
    // The source-turn gate is applied to both closed source rings AND open
    // one-sided arcs (e.g. a topological polygon's unbuffered-boundary remnant,
    // buffered with caps). An open arc can have a concave-join dent that is its
    // region's only coverage, which a purely geometric remover would cut away --
    // but the source-turn gate keeps such coverage via per-ring source-position
    // provenance, so it is safe here and lets the topological pipeline's
    // per-feature dissolve start from far cleaner rings (its dominant cost).
    // Callers whose winding construction is not safe to collapse this way (the
    // one-sided line buffer) opt out by passing no_loop_removal.
    function buildOneSidedRings(sideVerts) {
      // Outline mode offsets a closed source ring to a single self-contained
      // loop with no source-path edge to close it, so the loop must close on
      // itself at the start vertex. Starting at a corner leaves that seam
      // unjoined (the raw first/last offset endpoints sit off the boundary,
      // breaking inward elbow closures and the loop remover's first-vertex
      // assumption). Restart at the midpoint of the first edge: the seam then
      // falls mid-edge (collinear -- no join needed) and the original start
      // corner becomes an ordinary interior join.
      if (opts.outline && sideVerts.length > 2 && !pathIsOpen(sideVerts)) {
        sideVerts = startRingAtEdgeMidpoint(sideVerts);
      }
      var built = makeLeftBufferRings(sideVerts, dist,
        oneSidedBuffer ? pathSideVerts : null);
      if (opts.no_loop_removal || !opts.winding_fill) {
        return built.rings;
      }
      if (opts.outline) {
        // Outline mode rings are clean offset-only loops (no source-path edge),
        // so each has a consistent +/-1 base winding and the crossing-direction
        // remover classifies overshoot loops exactly from the ring geometry --
        // the same condition that makes it safe for the open-path two-sided
        // outline. (The band-ribbon rings of the default construction do not,
        // which is why they use the source-turn gate below.)
        return built.rings.map(function(ring) {
          return removeBufferRingLoopsByDirection(ring, BUFFER_LOOP_WINDOW);
        });
      }
      var turnPrefix = getSourceTurnPrefix(sideVerts);
      return built.rings.map(function(ring, i) {
        var srcPos = built.srcPositions[i];
        return srcPos ?
          removeBufferRingLoops(ring, BUFFER_LOOP_WINDOW, srcPos, turnPrefix) : ring;
      });
    }
  }

  function makeLeftBufferRings(verts, dist, pathSideVerts) {
    var rings = [];
    // Parallel to rings[]: each entry is the source-position array for the
    // corresponding ring (from builder.done()), or null for rings with no
    // single-path provenance (join sectors, band patches).
    var ringsSrcPos = [];
    var openPath = pathIsOpen(verts);
    var x0, y0, x1, y1, x2, y2; // path traversal coords
    var p1, p2; // endpoints of new offset segment
    var p1Prev, p2Prev; // endpoints of previous offset segment
    var p1First, p2First; // first offset segment, for joining closed paths
    var bearing, bearingPrev, joinAngle, hit;
    var firstBearing;
    var joinPoints;
    var segId;

    function flushRing() {
      var d = builder.done(!!opts.outline);
      if (!d) return; // outline loop collapsed (e.g. hole smaller than radius)
      rings.push(d.ring);
      ringsSrcPos.push(d.srcPos);
    }
    function pushAuxRing(ring) {
      rings.push(ring);
      ringsSrcPos.push(null);
    }

    if (verts.length > 0) {
      x0 = x2 = verts[0][0];
      y0 = y2 = verts[0][1];
      // Outline mode emits the offset polyline only (no source-path band edge),
      // so the ring is a single self-contained offset loop (see buildOneSidedRings).
      if (!opts.outline) addPathStart(verts[0]);
    }

    for (segId = 0; segId < verts.length - 1; segId++) {
      x1 = x2;
      y1 = y2;
      x2 = verts[segId + 1][0];
      y2 = verts[segId + 1][1];
      bearing = bearingDegrees2D(x1, y1, x2, y2);
      // offset current segment to the left
      p1 = getOffsetPoint(x1, y1, bearing - 90, dist);
      p2 = getOffsetPoint(x2, y2, bearing - 90, dist);

      if (segId === 0) {
        firstBearing = bearing;
        p1First = p1;
        p2First = p2;
      } else {
        joinAngle = getJoinAngle(bearingPrev, bearing);
      }

      // various connections between current offset segment and prev segment.
      // Offset ("buffer") vertices are tagged with the source segment id
      // (segId); the slight imprecision of tagging a previous-segment endpoint
      // (p2Prev) with the current segId is harmless for provenance tracking.
      if (segId === 0) {
        // first extruded segment - no previous segment to join to - add
        // first endpoint to the buffer
        builder.addBufferVertex(p1, segId);
      } else if (opts.winding_fill && joinAngle < 0) {
        // Clipper2-style concave join: never cut the band and never split the
        // ring. Walk the full incoming offset (p2Prev), dip back to the
        // original path vertex, then walk out the full outgoing offset (p1).
        // The self-overlap is resolved by the winding-number union, so no
        // section splits, join-sector rings, or band-coverage audit are needed.
        builder.addBufferVertex(p2Prev, segId);
        builder.addBufferVertex([x1, y1], segId);
        builder.addBufferVertex(p1, segId);
      } else if (joinAngle > roundJoinSegAngle * 1.5) {
        // large rightwards bend in path requiring a round join with at least
        // one interpolated segment
        // don't add endpoint of last offset segment to the buffer - we start
        // by extending the last segment to make an outside join
        // builder.addBufferVertex(p2Prev, false)
        joinPoints = makeOutsideRoundJoin(x1, y1, bearingPrev - 90, joinAngle, dist);
        builder.addBufferVertices(joinPoints, segId);
        // don't add first endpoint of new offset segment to the buffer - we just
        // added an extended vertex to replace it.
        // builder.addBufferVertex(p1, false)
        p1 = joinPoints.pop();
      } else if (joinAngle > -1e-10 && joinAngle < 1e-10) {
        // nearly collinear segments - add one point to the buffer
        // TODO: confirm that p1 and p2Prev are always very close
        builder.addBufferVertex(p1, segId);
      } else if (joinAngle > 0 && (hit = elbowJoin(p1Prev, p2Prev, p1, p2, bearingPrev, bearing, x1, y1, dist)) ||
        joinAngle < 0 && (hit = bufferSegmentIntersection(p1Prev, p2Prev, p1, p2))) {
        // shallow rightward bend in path, or leftward bend and segments
        // intersect: make an elbow join
        builder.addBufferVertex(hit, segId);
        p1 = hit;
      } else if (joinAngle > 0) {
        // Very shallow convex joins can fail to produce a useful elbow when
        // offset segments are nearly parallel or one segment is very short.
        // Treat them like nearly collinear segments instead of splitting.
        builder.addBufferVertex(p1, segId);
      } else if (joinAngle < 0 &&
          (hit = shallowAngleJoin(p2Prev, p1, x1, y1, dist))) {
        // Shallow leftward bend in path where segments do not intersect:
        // Replace center two endpoints with one averaged point
        // This was added because with unprojected datasets (using Mercator coords
        // and planar geometry but offset distances that vary with latitude), offset
        // segments at very shallow negative angles sometimes do not intersect. This
        // caused spikes in the buffer boundary and errors in keeping track of
        // whether the last-added vertex was inside or outside of the buffered area
        builder.addBufferVertex(hit, segId);
        p1 = hit;
      } else {
        // start a new buffer section to avoid gaps in dissolved buffer shape
        // caused by a tangle of intersecting interior paths
        builder.addBufferVertex(p2Prev, segId);
        flushRing();
        // Cover the wedge between the two offset directions with a round
        // join, emitted as a separate ring that shares its radial edges with
        // the two adjacent buffer sections; without it, the dissolved buffer
        // is pinched at the bend vertex.
        pushAuxRing(makeJoinSectorRing(x1, y1, bearing - 90, -joinAngle, dist, p1, p2Prev));
        if (!opts.outline) addPathStart(verts[segId]);
        builder.addBufferVertex(p1, segId);
      }

      if (!opts.outline) addPathSegment(verts[segId], verts[segId + 1], pathSideVerts);
      // in v4, offset direction (bearing) is the same for both segment
      // endpoints, because we are projecting lat/lon coords to Mercator and
      // using planar geometry for all datasets
      bearingPrev = bearing;
      p1Prev = p1;
      p2Prev = p2;
    }

    var closedPath = (x2 == x0 && y2 == y0);

    // TODO: add this to cap and join code below
    if (p2Prev && !(opts.outline && closedPath)) {
      // add final offset segment endpoint (the last path segment is never
      // suppressed, so the buffer section in progress ends normally).
      // Outline closed rings skip it: the midpoint-restart seam is collinear,
      // so p2Prev (the last segment's recomputed endpoint offset) is a ~1 ULP
      // duplicate of the first offset vertex p1First. The ring must close by
      // duplicating p1First exactly (done() below), not on a recalculated
      // final point -- the sub-ULP gap leaves a sliver the winding dissolve
      // cannot resolve, collapsing the whole buffer in some JS engines.
      builder.addBufferVertex(p2Prev, segId - 1);
    }

    if (opts.outline && closedPath) {
      // Collinear seam: builder.done() closes the offset loop by duplicating
      // its first vertex (p1First), the exact and correct closure. No join is
      // added here (the seam falls mid-edge, so there is no corner to join).
    } else if (closedPath) { // closed path
      // add join to finish closed path
      // TODO - figure out which bearing to use
      joinAngle = getJoinAngle(bearing, firstBearing);
      if (joinAngle > 0) {
        // Close the ring exactly onto its first offset vertex (p1First).
        // makeFinalJoin's terminal point is recomputed via
        // getOffsetPoint(seam, (bearing-90)+joinAngle) -- mathematically equal
        // to p1First = getOffsetPoint(seam, firstBearing-90) but ~1 ULP away,
        // because the closing angle is summed differently. That sub-ULP gap
        // leaves a near-zero-width sliver at the seam that the winding-number
        // dissolve cannot resolve consistently across JS engines (Math.sin/cos
        // last-ULP values differ between V8 versions), intermittently splitting
        // the filled buffer into a source-as-hole "band". Reusing p1First closes
        // the seam exactly. Copy it: buffer[0] is the same p1First reference and
        // unprojectFeatures() rewrites ring coordinates in place for lat-long
        // datasets, so a shared reference would be mutated twice.
        builder.addBufferVertices(makeRoundJoin(x2, y2, bearing - 90, joinAngle, dist), segId - 1);
        if (p1First) builder.addBufferVertex(p1First.concat(), segId - 1);
      } else if (joinAngle < 0 && segId > 1 &&
          !bufferSegmentIntersection(p1Prev, p2Prev, p1First, p2First)) {
        // Concave closure with non-intersecting first/last offset segments:
        // cover the wedge between the two offset directions with a separate
        // sector ring, like at section splits above (otherwise the dissolved
        // buffer is pinched at the closure vertex).
        pushAuxRing(makeJoinSectorRing(x2, y2, firstBearing - 90, -joinAngle, dist, p1First, p2Prev));
      }
    } else if (capStyle == 'round') {
      // open path, add a cap to finish. Cap vertices get a NaN source position
      // so loop removal never collapses a pocket that spans the cap.
      builder.addBufferVertices(makeRoundCap(x2, y2, bearing - 90, dist), NaN);
    }

    flushRing();
    if (openPath && !opts.no_audit && !opts.winding_fill) {
      // patch band regions that the join construction cut off without
      // replacement coverage (see addUncoveredCutBandRings); auditing the
      // original (unsimplified) vertices also catches places where
      // presimplification cost more than its error budget. The original
      // vertices are kept in path order, so the audit re-reverses them
      // when this is the reversed (right-side) traversal.
      var auditVerts = verts;
      if (pathSideVerts) {
        auditVerts = verts.length > 1 && verts[0]._idx > verts[verts.length - 1]._idx ?
          pathSideVerts.slice().reverse() : pathSideVerts;
      }
      addUncoveredCutBandRings(rings, auditVerts, dist);
      // band patches have no single-path provenance; keep arrays aligned
      while (ringsSrcPos.length < rings.length) ringsSrcPos.push(null);
    }
    return {rings: rings, srcPositions: ringsSrcPos};
  }

  // ---------------------------------------------------------------------
  // The traversal above approximates the buffer (the union of each
  // segment's offset band, plus join sectors and caps) with swept outline
  // rings. Several of its join constructions can cut parts of a band out
  // of every emitted ring: concave elbow joins eliminate band corners
  // (and, when the intersection falls near the far end of an offset
  // segment, nearly whole bands); ring splits leave radial edges that
  // nearby bands wrap behind when the path curves on toward the buffered
  // side. Most such cut regions are covered incidentally by other rings.
  // This pass probes every band against the rings that were actually
  // emitted and emits an explicit band ring for each band with an
  // uncovered gap larger than the error budget (smaller gaps are
  // legitimate join trimming within the buffer's stated tolerance). A
  // band ring is a subset of the buffer, so adding one is always safe;
  // it is inset slightly so its edges cannot coincide with the other
  // rings' edges.
  function addUncoveredCutBandRings(rings, verts, dist) {
    var n = verts.length;
    if (n < 3 || rings.length === 0) return;
    var risky = findAtRiskSegments(verts, dist);
    if (!risky) return;
    var stab = getRingStabber(rings, dist);
    var tolPct = simplifyIntervalFn ? simplifyIntervalFn(dist) / dist : 0;
    var maxGapPct = Math.max(0.01, tolPct + 0.005);
    var quads = [];
    var i, ti, a, b, bearing, rUnits, m, t, base, probe;
    for (i = 0; i < n - 1; i++) {
      if (!risky[i]) continue;
      a = verts[i];
      b = verts[i + 1];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      bearing = bearingDegrees2D(a[0], a[1], b[0], b[1]);
      probe = getOffsetPoint(a[0], a[1], bearing - 90, dist);
      rUnits = distance2D(a[0], a[1], probe[0], probe[1]);
      // perpendicular stab lines every ~0.35r along the band, so cuts
      // affecting only part of a long segment cannot slip between them
      m = Math.max(1, Math.min(60,
        Math.ceil(distance2D(a[0], a[1], b[0], b[1]) / (rUnits * 0.35))));
      for (ti = 0; ti < m; ti++) {
        t = (ti + 0.5) / m;
        base = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (stab(base, bearing - 90) > maxGapPct * rUnits) {
          quads.push(i);
          break;
        }
      }
    }
    quads.forEach(function(segId) {
      addBandRing(rings, verts[segId], verts[segId + 1], dist);
    });
  }

  // Identify the path segments whose offset bands could have been cut by
  // the join construction, so the band audit can skip the rest. A band
  // can only lose coverage near:
  // - a concave bend whose corner cut escapes the adjacent band, i.e. the
  //   eliminated offset corner's perpendicular foot falls outside the
  //   neighbor segment (with a long enough neighbor, the cut region is
  //   covered by the neighbor's band; this is also a superset of the
  //   non-intersecting bends that split the ring);
  // - a path endpoint (the ring's start and cap-closing radial edges);
  // - a fold, where the path returns near itself (offset geometry from a
  //   path-distant stretch can cross the band).
  // All cut regions lie within the local offset reach of their bend or
  // fold, so segments more than ~2.5r along the path from every risk
  // vertex are provably covered by their own section ring and are not
  // audited. Returns null when nothing is at risk, or a Uint8Array of
  // per-segment flags.
  function findAtRiskSegments(verts, dist) {
    var n = verts.length;
    var probe0 = getOffsetPoint(verts[0][0], verts[0][1], 0, dist);
    var rUnits = distance2D(verts[0][0], verts[0][1], probe0[0], probe0[1]);
    var cumLen = new Float64Array(n);
    var riskVert = new Uint8Array(n);
    var any = false;
    var i, j, k;
    for (i = 1; i < n; i++) {
      cumLen[i] = cumLen[i - 1] +
        distance2D(verts[i - 1][0], verts[i - 1][1], verts[i][0], verts[i][1]);
    }
    // the ring's start radial and cap-closing radial can cut nearby bands
    riskVert[0] = riskVert[n - 1] = 1;
    any = true;
    // concave bends with escaping corner cuts
    for (i = 1; i < n - 1; i++) {
      var ax = verts[i][0] - verts[i - 1][0];
      var ay = verts[i][1] - verts[i - 1][1];
      var bx = verts[i + 1][0] - verts[i][0];
      var by = verts[i + 1][1] - verts[i][1];
      var la = Math.sqrt(ax * ax + ay * ay);
      var lb = Math.sqrt(bx * bx + by * by);
      if (la === 0 || lb === 0) continue;
      var cross = ax * by - ay * bx;
      if (cross <= 0) continue; // convex or straight (left turns are CCW)
      // eliminated corner of the outgoing band: foot on the incoming
      // segment is at la - r*sin(bend); it escapes if negative (and
      // symmetrically for the incoming band on the outgoing segment)
      var sinBend = cross / (la * lb);
      if (rUnits * sinBend > la || rUnits * sinBend > lb) {
        riskVert[i] = 1;
        any = true;
      }
    }
    // sustained curvature: windows of path turning ~40+ degrees net
    // within ~3r of path length (cumulative concave corner cuts and
    // offset fans can dent such stretches even when every individual
    // bend looks harmless, e.g. wide gentle loops)
    var turnPrefix = new Float64Array(n);
    for (i = 1; i < n - 1; i++) {
      var b1x = verts[i][0] - verts[i - 1][0];
      var b1y = verts[i][1] - verts[i - 1][1];
      var b2x = verts[i + 1][0] - verts[i][0];
      var b2y = verts[i + 1][1] - verts[i][1];
      turnPrefix[i] = turnPrefix[i - 1] +
        Math.atan2(b1x * b2y - b1y * b2x, b1x * b2x + b1y * b2y);
    }
    turnPrefix[n - 1] = turnPrefix[n - 2];
    var window = rUnits * 3;
    var maxTurn = 48 * Math.PI / 180;
    for (i = 0, j = 0; i < n - 1; i++) {
      if (j < i + 1) j = i + 1;
      while (j < n - 1 && cumLen[j + 1] - cumLen[i] <= window) j++;
      // only net turning toward the buffered side (left, positive) is
      // dangerous; sustained convex curvature is covered by round joins
      if (turnPrefix[j] - turnPrefix[i] >= maxTurn) {
        riskVert[i] = riskVert[j] = 1;
        any = true;
      }
    }
    // folds: vertices much closer in space than along the path
    var cell = rUnits * 2.2;
    var grid = new Map();
    var GK = 0x40000; // numeric grid key stride
    for (i = 0; i < n; i++) {
      var key = Math.round(verts[i][0] / cell) * GK + Math.round(verts[i][1] / cell);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    for (i = 0; i < n; i++) {
      if (riskVert[i]) continue;
      var gx = Math.round(verts[i][0] / cell);
      var gy = Math.round(verts[i][1] / cell);
      for (var dx = -1; dx <= 1 && !riskVert[i]; dx++) {
        for (var dy = -1; dy <= 1 && !riskVert[i]; dy++) {
          var ids = grid.get((gx + dx) * GK + (gy + dy));
          if (!ids) continue;
          for (k = 0; k < ids.length; k++) {
            j = ids[k];
            if (j <= i) continue;
            var pathDist = cumLen[j] - cumLen[i];
            var d = distance2D(verts[i][0], verts[i][1], verts[j][0], verts[j][1]);
            // 0.8 flags vertex pairs whose intervening path bends by
            // ~130 degrees or more (a circle's chord/arc ratio is 2/pi,
            // so even gentle loops qualify)
            if (d < cell && d < pathDist * 0.8) {
              riskVert[i] = riskVert[j] = 1;
              any = true;
              break;
            }
          }
        }
      }
    }
    if (!any) return null;
    // mark segments within 2.5r along the path of any risk vertex
    var reach = rUnits * 2.5;
    var risky = new Uint8Array(n - 1);
    var seg = 0;
    for (i = 0; i < n; i++) {
      if (!riskVert[i]) continue;
      // advance to the first segment ending within reach of this vertex,
      // then mark until past it (risk vertices are in path order, so the
      // cursor only moves forward)
      while (seg < n - 1 && cumLen[seg + 1] < cumLen[i] - reach) seg++;
      for (j = seg; j < n - 1 && cumLen[j] <= cumLen[i] + reach; j++) {
        risky[j] = 1;
      }
    }
    return risky;
  }

  // Returns a function that probes the emitted rings along the band
  // perpendicular at a path point, and returns the length of the longest
  // sub-interval of (0, 0.98r] that no ring covers.
  //
  // Coverage uses the total signed winding of all rings combined: a point
  // is reported covered where that total is nonzero. The dissolve's own
  // union semantics are "covered where SOME ring's winding is nonzero", so
  // these differ only where rings of opposite winding overlap and cancel
  // (total 0 but individually nonzero). There the audit reports a gap and
  // patches it with a band ring; since a band ring is always a subset of
  // the buffer, the extra patch is harmless. Crucially, a nonzero total
  // implies some ring is nonzero, so this can never report a covered point
  // as a gap-free covered one falsely -- it only ever errs toward patching,
  // never toward leaving a real gap. Tracking one signed winding instead of
  // a per-ring table keeps the inner loop and the gap walk simple.
  //
  // Ring edges are indexed in vertical slabs of width r, so each query
  // scans only the edges in the slab(s) the stab line crosses; the winding
  // at the near end is seeded by an upward ray over those same edges.
  function getRingStabber(rings, dist) {
    var probe0 = getOffsetPoint(rings[0][0][0], rings[0][0][1], 0, dist);
    var slabW = distance2D(rings[0][0][0], rings[0][0][1], probe0[0], probe0[1]);
    var ex = [], ey = [], fx = [], fy = []; // edge data
    var slabs = new Map();
    rings.forEach(function(ring) {
      for (var i = 0; i < ring.length - 1; i++) {
        var id = ex.length;
        ex.push(ring[i][0]);
        ey.push(ring[i][1]);
        fx.push(ring[i + 1][0]);
        fy.push(ring[i + 1][1]);
        var s0 = Math.floor(Math.min(ring[i][0], ring[i + 1][0]) / slabW);
        var s1 = Math.floor(Math.max(ring[i][0], ring[i + 1][0]) / slabW);
        for (var si = s0; si <= s1; si++) {
          if (!slabs.has(si)) slabs.set(si, []);
          slabs.get(si).push(id);
        }
      }
    });
    var seenStamp = new Uint32Array(ex.length);
    var stamp = 0;
    var crossings = [];

    return function(base, normalBearing) {
      stamp++;
      crossings.length = 0;
      var p0 = getOffsetPoint(base[0], base[1], normalBearing, dist * 0.002);
      var p1 = getOffsetPoint(base[0], base[1], normalBearing, dist * 0.98);
      var sx = p1[0] - p0[0];
      var sy = p1[1] - p0[1];
      var S = Math.sqrt(sx * sx + sy * sy);
      var s0 = Math.floor(Math.min(p0[0], p1[0]) / slabW);
      var s1 = Math.floor(Math.max(p0[0], p1[0]) / slabW);
      var si, ids, k, id, dgx, dgy, den, qx, qy, t, u, dir;
      var winding = 0; // total signed winding at p0, seeded below
      for (si = s0; si <= s1; si++) {
        ids = slabs.get(si);
        if (!ids) continue;
        for (k = 0; k < ids.length; k++) {
          id = ids[k];
          if (seenStamp[id] === stamp) continue;
          seenStamp[id] = stamp;
          // seed the total winding at p0, via upward-ray crossings
          dir = 0;
          if (ex[id] <= p0[0] && fx[id] > p0[0]) dir = 1;
          else if (fx[id] <= p0[0] && ex[id] > p0[0]) dir = -1;
          if (dir !== 0 &&
              ey[id] + (fy[id] - ey[id]) * (p0[0] - ex[id]) / (fx[id] - ex[id]) > p0[1]) {
            winding += dir;
          }
          // crossing of the stab segment
          dgx = fx[id] - ex[id];
          dgy = fy[id] - ey[id];
          den = sx * dgy - sy * dgx;
          if (den === 0) continue;
          qx = ex[id] - p0[0];
          qy = ey[id] - p0[1];
          t = (qx * dgy - qy * dgx) / den;
          u = (qx * sy - qy * sx) / den;
          if (t <= 0 || t >= 1 || u < 0 || u >= 1) continue;
          // moving along the stab, the total winding changes by
          // +sign(cross(stab, edge)) (consistent with the upward-ray
          // convention above)
          crossings.push([t * S, den > 0 ? 1 : -1]);
        }
      }
      crossings.sort(function(a, b) { return a[0] - b[0]; });
      var gapStart = winding !== 0 ? -1 : 0;
      var maxGap = 0;
      for (k = 0; k < crossings.length; k++) {
        var prev = winding;
        winding += crossings[k][1];
        if (prev === 0 && winding !== 0) {
          if (gapStart >= 0 && crossings[k][0] - gapStart > maxGap) {
            maxGap = crossings[k][0] - gapStart;
          }
          gapStart = -1;
        } else if (prev !== 0 && winding === 0) {
          gapStart = crossings[k][0];
        }
      }
      if (winding === 0 && gapStart >= 0 && S - gapStart > maxGap) {
        maxGap = S - gapStart;
      }
      return maxGap;
    };
  }

  // Add a band ring covering one path segment's offset band, inset on all
  // sides by a sliver of the buffer distance so that none of its edges
  // can coincide with the section rings' edges (the dissolve's hole
  // divider mis-handles coincident same-direction edges within a shape).
  // The uncovered sliver margins lie along edges of other rings, so no
  // coverage is lost. (Coordinates are copied -- arrays may not be shared
  // between rings.)
  function addBandRing(rings, a, b, dist) {
    if (a[0] === b[0] && a[1] === b[1]) return;
    var bearing = bearingDegrees2D(a[0], a[1], b[0], b[1]);
    var eps = dist * 1e-4;
    var aIn = getOffsetPoint(a[0], a[1], bearing, eps);
    var bIn = getOffsetPoint(b[0], b[1], bearing - 180, eps);
    if (distance2D(a[0], a[1], b[0], b[1]) <
        distance2D(a[0], a[1], aIn[0], aIn[1]) * 3) {
      return; // segment too short to inset
    }
    rings.push([
      getOffsetPoint(aIn[0], aIn[1], bearing - 90, eps),
      getOffsetPoint(aIn[0], aIn[1], bearing - 90, dist - eps),
      getOffsetPoint(bIn[0], bIn[1], bearing - 90, dist - eps),
      getOffsetPoint(bIn[0], bIn[1], bearing - 90, eps),
      getOffsetPoint(aIn[0], aIn[1], bearing - 90, eps)
    ]);
  }

  function addPathStart(p) {
    builder.addPathVertex([p[0], p[1]]);
  }

  function addPathSegment(a, b, pathSideVerts) {
    var aidx = a._idx;
    var bidx = b._idx;
    var step, i;
    if (!pathSideVerts || aidx < 0 || bidx < 0 || aidx == null || bidx == null) {
      builder.addPathVertex([b[0], b[1]]);
      return;
    }
    step = aidx < bidx ? 1 : -1;
    for (i = aidx + step; step > 0 ? i <= bidx : i >= bidx; i += step) {
      builder.addPathVertex([pathSideVerts[i][0], pathSideVerts[i][1]]);
    }
  }

  function pathIsOpen(verts) {
    var n = verts.length;
    if (n < 2) return false;
    return verts[0][0] !== verts[n-1][0] || verts[0][1] !== verts[n-1][1];
  }

  // get angle between two extruded segments in degrees
  // positive angle means join is convex; negative angle means join is concave
  function getJoinAngle(direction1, direction2) {
    var delta = direction2 - direction1;
    if (delta > 180) {
      delta -= 360;
    }
    if (delta < -180) {
      delta += 360;
    }
    return delta;
  }

  function makeTwoSidedOutlineRing(verts, dist) {
    // Build the two offset sides in opposite traversal order, so both sides
    // are generated with the same left-offset join logic.
    var n = verts.length;
    var left = makeOffsetSide(verts, dist);
    var right = makeOffsetSide(verts.slice().reverse(), dist);
    var firstBearing = left.firstBearing;
    var lastBearing = left.lastBearing;
    var p0 = verts[0];
    var pn = verts[n - 1];
    // End cap connects the left side to the reversed right side; start cap
    // closes the ring back to the beginning of the left side.
    var endCap = makeCap(pn[0], pn[1], lastBearing - 90, dist);
    var startCap = makeCap(p0[0], p0[1], firstBearing + 90, dist);
    var ring = left.points.concat(endCap, right.points, startCap);
    ring.push(ring[0].concat());
    // Source-vertex position parallel to ring[]. The right side was traced in
    // reverse, so its positions map back to source order; cap points get NaN so
    // a pocket spanning a cap is never treated as a single-bend overshoot.
    var nan = function(arr) { return arr.map(function() { return NaN; }); };
    var rightPos = right.srcPos.map(function(p) { return (n - 1) - p; });
    var srcPos = left.srcPos.concat(nan(endCap), rightPos, nan(startCap));
    srcPos.push(srcPos[0]);
    return {ring: ring, srcPos: srcPos};
  }

  // Cumulative absolute turn of the source path, indexed by vertex. The turn
  // between two source positions a < b is prefix[b] - prefix[a]; a buffer hole
  // requires the path to wind far enough to enclose an uncovered region, so it
  // spans a large turn, while a shallow concavity that merely makes the offset
  // overshoot itself spans a small turn.
  function getSourceTurnPrefix(verts) {
    var n = verts.length;
    var prefix = new Float64Array(n);
    if (n < 3) return prefix;
    var prev = bearingDegrees2D(verts[0][0], verts[0][1], verts[1][0], verts[1][1]);
    for (var k = 1; k < n - 1; k++) {
      var b = bearingDegrees2D(verts[k][0], verts[k][1], verts[k + 1][0], verts[k + 1][1]);
      prefix[k] = prefix[k - 1] + Math.abs(getJoinAngle(prev, b));
      prev = b;
    }
    prefix[n - 1] = prefix[n - 2];
    return prefix;
  }

  function makeOffsetSide(verts, dist) {
    // Trace a single left-offset side of the source path, including joins
    // between adjacent offset segments but not endpoint caps. srcPos[] records,
    // per emitted point, the source-path vertex it derives from, so loop
    // removal can judge a self-crossing by the turn of the originating path
    // span rather than by the (unreliable) geometry of the offset itself.
    var points = [];
    var srcPos = [];
    var x1, y1, x2, y2, bearing, bearingPrev, joinAngle, hit;
    var p1, p2, p1Prev, p2Prev;
    var firstBearing, lastBearing, joinPoints;
    var pos = 0;
    function pushPt(p) {
      var before = points.length;
      addPoint(points, p);
      if (points.length > before) srcPos.push(pos);
    }
    function pushPts(pts) {
      for (var i = 0; i < pts.length; i++) pushPt(pts[i]);
    }
    for (var segId = 0; segId < verts.length - 1; segId++) {
      x1 = verts[segId][0];
      y1 = verts[segId][1];
      x2 = verts[segId + 1][0];
      y2 = verts[segId + 1][1];
      bearing = bearingDegrees2D(x1, y1, x2, y2);
      p1 = getOffsetPoint(x1, y1, bearing - 90, dist);
      p2 = getOffsetPoint(x2, y2, bearing - 90, dist);
      pos = segId;
      if (segId === 0) {
        pushPt(p1);
        firstBearing = bearing;
      } else {
        joinAngle = getJoinAngle(bearingPrev, bearing);
        if (opts.winding_fill && joinAngle < 0) {
          // Clipper2-style concave join: never cut the band. Walk the full
          // incoming offset (p2Prev), dip back to the original vertex, then
          // walk out the full outgoing offset (p1). The self-overlapping
          // pocket this creates is resolved by the winding-number union
          // (it cancels where another band covers it, survives where the
          // concavity is real), so no band-coverage audit is needed.
          pushPt(p2Prev);
          pushPt([x1, y1]);
          pushPt(p1);
        } else if (joinAngle > roundJoinSegAngle * 1.5) {
          joinPoints = makeOutsideRoundJoin(x1, y1, bearingPrev - 90, joinAngle, dist);
          pushPts(joinPoints);
          p1 = joinPoints[joinPoints.length - 1];
        } else if (joinAngle > -1e-10 && joinAngle < 1e-10) {
          pushPt(p1);
        } else if (joinAngle > 0 && (hit = elbowJoin(p1Prev, p2Prev, p1, p2,
            bearingPrev, bearing, x1, y1, dist)) ||
            joinAngle < 0 && (hit = bufferSegmentIntersection(p1Prev, p2Prev, p1, p2))) {
          pushPt(hit);
          p1 = hit;
        } else if (joinAngle > 0) {
          pushPt(p1);
        } else if (joinAngle < 0 && (hit = shallowAngleJoin(p2Prev, p1, x1, y1, dist))) {
          pushPt(hit);
          p1 = hit;
        } else {
          pushPt(p2Prev);
          pushPts(makeConcaveJoin(x1, y1, bearing - 90, -joinAngle, dist));
          pushPt(p1);
        }
      }
      bearingPrev = bearing;
      p1Prev = p1;
      p2Prev = p2;
      lastBearing = bearing;
    }
    pos = verts.length - 1;
    pushPt(p2Prev);
    return {
      points: points,
      srcPos: srcPos,
      firstBearing: firstBearing,
      lastBearing: lastBearing
    };
  }

  function addPoints(arr, points) {
    for (var i = 0; i < points.length; i++) {
      addPoint(arr, points[i]);
    }
  }

  function addPoint(arr, p) {
    var prev = arr[arr.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) {
      arr.push(p);
    }
  }

  // Reduce a path's vertex count with Douglas-Peucker simplification
  // before buffering. Removed vertices lie within the interval of the
  // simplified path, so the buffer outline deviates from the unsimplified
  // buffer by at most the interval; D.P. retains locally extreme vertices
  // (the ones that determine the outline), so the typical deviation is
  // much smaller. Collapsed paths fall back to their original vertices: a
  // small ring is below the error budget, but its buffer is a whole disk.
  function presimplifyPathVerts(verts, interval, dist) {
    var n = verts.length;
    var mercScale = 1;
    var i;
    if (n < 3 || !(interval > 0)) return verts;
    if (useMercator) {
      // convert meters to projected Mercator units, using the path's
      // smallest scale factor so the interval is never too large
      var minAbsY = Infinity;
      for (i = 0; i < n; i++) {
        if (Math.abs(verts[i][1]) < minAbsY) minAbsY = Math.abs(verts[i][1]);
      }
      mercScale = 1 / Math.cos(Math.atan(Math.sinh(minAbsY / R)));
      interval = interval * mercScale;
    }
    var xx = new Float64Array(n);
    var yy = new Float64Array(n);
    var kk = new Float64Array(n);
    for (i = 0; i < n; i++) {
      xx[i] = verts[i][0];
      yy[i] = verts[i][1];
    }
    DouglasPeucker.calcArcData(kk, xx, yy);
    // Retain the second vertex from each end, so the bearings of the end
    // segments are preserved exactly: cap geometry at path endpoints
    // (flat caps especially) depends on them.
    kk[1] = kk[n-2] = Infinity;
    if (oneSidedBuffer) {
      // One-sided coverage is directional, so the turning that
      // simplification concentrates into single bends must stay below the
      // angle whose corner cut at the buffer radius would exceed the
      // simplification interval (see limitGapTurning).
      limitGapTurning(verts, kk, interval,
        2 * Math.acos(1 / (1 + interval / (dist * mercScale))));
    }
    var verts2 = [];
    for (i = 0; i < n; i++) {
      if (kk[i] >= interval) verts2.push(verts[i]);
    }
    var closed = verts[0][0] === verts[n-1][0] && verts[0][1] === verts[n-1][1];
    return verts2.length >= (closed ? 4 : 2) ? verts2 : verts;
  }

  // One-sided buffer coverage is directional: each segment's band lies on
  // one side of its own bearing, so the angular structure of the path
  // matters with weight proportional to the buffer radius, not just its
  // positional structure. Replacing a sub-path with a chord concentrates
  // the sub-path's turning into the chord's two end joints: convex
  // turning is harmless (round joins reproduce the full fan of coverage
  // around a retained vertex), but concentrated concave turning B deepens
  // the corner cut at the joint from gradual elbow cuts to a single cut
  // ~ r * (1/cos(B/2) - 1) deeper, and a removed self-loop's 360 degrees
  // of turning would cost a whole swept disk. Capping each gap's total
  // absolute turning (interior bends plus the bearing mismatch between
  // the chord and the gap's end segments) at the angle whose corner cut
  // equals the simplification interval keeps the one-sided buffer's error
  // within the interval; where a gap exceeds the cap, re-retain its most
  // prominent vertex (the D.P. split point) and re-check the halves. A
  // self-loop subdivides into a coarse polygon with the same total
  // turning, which sweeps the same disk.
  function limitGapTurning(verts, kk, interval, maxTurn) {
    var stack = [];
    var prev = 0;
    var i, a, b, gap;
    for (i = 1; i < verts.length; i++) {
      if (kk[i] >= interval) {
        if (i - prev > 1) stack.push([prev, i]);
        prev = i;
      }
    }
    while (stack.length > 0) {
      gap = stack.pop();
      a = gap[0];
      b = gap[1];
      if (b - a < 2 || gapTurning(verts, a, b) <= maxTurn) continue;
      var maxI = a + 1;
      for (i = a + 2; i < b; i++) {
        if (kk[i] > kk[maxI]) maxI = i;
      }
      kk[maxI] = Infinity;
      stack.push([a, maxI], [maxI, b]);
    }
  }

  // Total absolute turning (in radians) concentrated by replacing the
  // sub-path verts[a..b] with a single chord: bends interior to the gap,
  // plus the mismatch between the chord bearing and the bearings of the
  // gap's first and last segments.
  function gapTurning(verts, a, b) {
    var chord = Math.atan2(verts[b][0] - verts[a][0], verts[b][1] - verts[a][1]);
    if (verts[b][0] === verts[a][0] && verts[b][1] === verts[a][1]) {
      return Infinity; // gap closes on itself (a loop)
    }
    var total = 0;
    var prev = chord;
    for (var i = a; i < b; i++) {
      var bearing = Math.atan2(verts[i+1][0] - verts[i][0], verts[i+1][1] - verts[i][1]);
      total += Math.abs(angleDelta(prev, bearing));
      prev = bearing;
    }
    total += Math.abs(angleDelta(prev, chord));
    return total;
  }

  function angleDelta(a, b) {
    var d = b - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  // Traverse a path with the (possibly projecting) path iterator,
  // collecting its vertices into an array; skips duplicate points.
  function collectPathVertices(path) {
    var verts = [];
    var x, y, p;
    pathIter.init(path);
    while (pathIter.hasNext()) {
      // TODO: use a tolerance
      if (verts.length > 0 && pathIter.x === x && pathIter.y === y) {
        debug("skipping a duplicate point");
        continue;
      }
      x = pathIter.x;
      y = pathIter.y;
      p = [x, y];
      p._idx = verts.length;
      verts.push(p);
    }
    return verts;
  }

  function makeRoundCap(x, y, startDir, dist) {
    var points = makeBearingAlignedArc(x, y, startDir, 180, dist);
    points.push(getOffsetPoint(x, y, startDir + 180, dist)); // add final vertex
    return points;
  }

  function makeCap(x, y, startDir, dist) {
    return capStyle == 'round' ? makeRoundCap(x, y, startDir, dist) :
      [getOffsetPoint(x, y, startDir + 180, dist)];
  }

  // The vertices of this join are outside of the arc that it approximates and
  // the segments of the join touch the arc at their midpoints.
  // The first and last of the returned vertices extend the segments on either
  // side of the join.
  function makeOutsideRoundJoin(cx, cy, startBearing, arcAngle, dist) {
    // point count of 1 would be an elbow joint
    // (elbow joins should be created elsewhere)
    var pointCount = Math.max(1, Math.round(arcAngle / roundJoinSegAngle));
    var stepAngle = arcAngle / pointCount;
    var points = [];
    var i = 0;
    var a, b, c, d, joinP, tanP, bearing;
    while (i <= pointCount) {
      bearing = startBearing + stepAngle * i;
      tanP = getOffsetPoint(cx, cy, bearing, dist);
      c = getOffsetPoint(tanP[0], tanP[1], bearing - 90, dist * 2);
      d = getOffsetPoint(tanP[0], tanP[1], bearing + 90, dist * 2);
      if (i > 0) {
        joinP = bufferSegmentIntersection(a, b, c, d);
        if (!joinP) {
          if (opts.polar) {
            // Near a clamped pole/antimeridian corner the swept offset tangents
            // collapse onto the boundary and stop intersecting; hug the clamped
            // tangent point so the round join degenerates to the pinned corner
            // instead of throwing.
            points.push(tanP);
          } else {
            throw Error(`no intersection on ${i} of ${pointCount}`);
          }
        } else {
          points.push(joinP);
        }
      }
      a = c;
      b = d;
      i++;
    }
    return points;
  }

  function shallowAngleJoin(a, b, cx, cy, dist) {
    var gap = distance2D(a[0], a[1], b[0], b[1]);
    var radius = getJoinExtensionDistance(cx, cy, a, b, dist);
    if (gap > radius * 1e-3) return null;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }

  function elbowJoin(a, b, c, d, bearing1, bearing2, cx, cy, dist) {
    var k = 2 ** 13;
    var len = getJoinExtensionDistance(cx, cy, b, c, dist) * k;
    var b2 = getPlanarSegmentEndpoint(b[0], b[1], bearing1, len);
    var c2 = getPlanarSegmentEndpoint(c[0], c[1], bearing2 + 180, len);
    return bufferSegmentIntersection(a, b2, c2, d);
  }

  function getJoinExtensionDistance(cx, cy, a, b, dist) {
    var ax = a[0] - cx;
    var ay = a[1] - cy;
    var bx = b[0] - cx;
    var by = b[1] - cy;
    return Math.max(dist, Math.sqrt(ax * ax + ay * ay), Math.sqrt(bx * bx + by * by));
  }

  // Make a ring covering the circular wedge between two offset directions
  // at a concave bend where a new buffer section starts. The ring runs
  // corner -> startPoint -> arc -> endPoint -> corner, so it has the same
  // (clockwise) polarity as the buffer section rings and shares its radial
  // edges with the sections on either side of the bend.
  // (points are copied - arrays may not be shared between rings, because
  // unprojectFeatures() converts coordinates in place)
  function makeJoinSectorRing(cx, cy, startBearing, arcAngle, dist, startPoint, endPoint) {
    var points = makeRoundJoin(cx, cy, startBearing, arcAngle, dist);
    points.unshift([cx, cy], [startPoint[0], startPoint[1]]);
    points.push([endPoint[0], endPoint[1]], [cx, cy]);
    return points;
  }

  function makeConcaveJoin(cx, cy, startBearing, arcAngle, dist) {
    return makeRoundJoin(cx, cy, startBearing, arcAngle, dist).reverse();
  }

  // get interior vertices of an interpolated CW arc
  function makeRoundJoin(cx, cy, startBearing, arcAngle, dist) {
    var points = [];
    var increment = 90 / roundJoinSegsPerQuadrant;
    var angle = increment;
    while (angle < arcAngle) {
      points.push(getOffsetPoint(cx, cy, startBearing + angle, dist));
      angle += increment;
    }
    return points;
  }

  // get interior vertices of a CW arc using a fixed bearing grid
  function makeBearingAlignedArc(cx, cy, startBearing, arcAngle, dist) {
    var points = [];
    var eps = 1e-10;
    var bearing = roundJoinSegAngle * Math.ceil((startBearing + eps) / roundJoinSegAngle);
    var endBearing = startBearing + arcAngle;
    while (bearing < endBearing - eps) {
      points.push(getOffsetPoint(cx, cy, bearing, dist));
      bearing += roundJoinSegAngle;
    }
    return points;
  }

}

