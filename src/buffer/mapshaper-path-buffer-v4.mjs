import { debug, stop } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';
import { ShapeIter } from '../paths/mapshaper-shape-iter';
import { BufferBuilder } from './mapshaper-buffer-builder';
import { bufferSegmentIntersection, getBufferSimplifyFunction, useGapPatch } from './mapshaper-buffer-common';
import { buildVertsSegmentIndex, wedgeIsExposed } from './mapshaper-wedge-exposure';
import { chooseSeamEdge } from './mapshaper-buffer-seam-edge';
import { removeBufferRingLoops, removeBufferRingLoopsIterative, BUFFER_LOOP_WINDOW, BUFFER_LOOP_FILL_AREA_FRAC } from './mapshaper-buffer-loop-removal';
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
  // Max arc step (degrees) for the coarse concave bridge (makeCoarseConcaveJoin),
  // the optional low-resolution alternative to makeConcaveJoin in
  // traceCleanOffsetSide. Larger = fewer points = faster dissolve. The reversed
  // bridge only bounds a self-overlap loop that the direction remover collapses,
  // so its resolution does not affect the final boundary.
  var CLEAN_OUTLINE_BRIDGE_STEP = 90;
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
        coordinates: rings.map(function(ring) { return [ring]; })
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
  // Re-anchor a closed ring [v0, v1, ..., v0] so its offset seam falls at the
  // midpoint of a chosen edge (vk -> vk+1): returns [m, vk+1, ..., vk, m] where
  // m = midpoint(vk, vk+1). The offset then starts/ends mid-edge (a collinear
  // seam) and every original vertex becomes an interior join.
  //
  // The seam edge is chosen by chooseSeamEdge() to sit away from concave (reflex)
  // corners. In winding-fill mode a concave corner dips the offset back to its
  // source vertex (resolved later by the dissolve); a seam landing next to such a
  // dip leaves the pre-dissolve overshoot-loop remover (removeBufferRingLoops*)
  // starting from an anchor buried inside that tangle, where it can collapse the
  // true outer boundary instead of the self-overlap (an inward notch). Putting the
  // seam in a clean convex stretch keeps the remover's first-vertex anchor on the
  // real boundary.
  function startRingAtEdgeMidpoint(verts) {
    var k = chooseSeamEdge(verts);
    var n = verts.length - 1; // distinct vertices (verts[0] == verts[n])
    var a = verts[k], b = verts[(k + 1) % n];
    var m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    var out = [m];
    for (var t = 1; t <= n; t++) out.push(verts[(k + t) % n]);
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
    // Closed two-sided line rings: open with a sub-tolerance gap at the first
    // vertex so the open-path outline builder applies (round caps close the
    // seam). Gap size is in the same coordinate units as verts.
    if (!oneSidedBuffer && !opts.band_method && !pathIsOpen(verts)) {
      verts = openClosedRingWithMicroGap(verts);
    }
    if (!opts.band_method && pathIsOpen(verts) && (!oneSidedBuffer || opts.outline)) {
      // Fast path for ordinary two-sided line buffers: emit one closed
      // outline instead of many per-segment bands that must be dissolved.
      // The band-method escape hatch skips it to fall through to the
      // per-segment band construction (makeLeftBufferRings, no winding fill).
      //
      // Also used for the topological polygon grow's OPEN boundary chains
      // (outline mode, one-sided 'left'): an open unshared-boundary chain must
      // be capped on BOTH ends. The one-sided outline (buildCleanOutlineRings)
      // offsets a single side and self-closes with a straight chord between the
      // chain's endpoints -- harmless when they nearly coincide, but for a chain
      // spanning a whole border (e.g. a state's Canada boundary) that chord is a
      // multi-degree spike. The two-sided stadium caps both ends instead; the
      // mosaic union with the source polygon absorbs the inner (interior) half.
      var built = makeTwoSidedOutlineRing(verts, dist);
      var out;
      if (opts.no_loop_removal) {
        out = [built.ring];
      } else {
        // Multi-pass dip+coverage remover: construction-tagged reversed concave-join
        // ("dip") cusps mark self-overlap folds, and an exact scanline coverage
        // check refuses any collapse that would uncover a real boundary lobe OR
        // swallow a real hole/notch.
        out = [removeBufferRingLoopsIterative(built.ring, BUFFER_LOOP_WINDOW,
          null, null, undefined, built.dipTags, undefined,
          dist * dist * BUFFER_LOOP_FILL_AREA_FRAC)];
      }
      // Geodesic fan-apart gap patches (same mechanism as the polygon outline):
      // union a single-segment round-cap stadium for the source segments at each
      // exposed fan-apart bend so the winding dissolve fills the sliver gap.
      if (built.fanApartBends.length) {
        addFanApartGapPatches(out, verts, built.fanApartBends, dist,
          ringSignedArea(out[0]) >= 0);
      }
      return out;
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
      // Polygon-grow outline: the shared constant-radius construction used by
      // two-sided line outlines (traceCleanOffsetSide + dip+coverage loop
      // removal inside buildCleanOutlineRings).
      if (opts.outline) {
        return buildCleanOutlineRings(sideVerts, dist);
      }
      var built = makeLeftBufferRings(sideVerts, dist,
        oneSidedBuffer ? pathSideVerts : null);
      if (opts.no_loop_removal || !opts.winding_fill) {
        return built.rings;
      }
      var turnPrefix = getSourceTurnPrefix(sideVerts);
      return built.rings.map(function(ring, i) {
        var srcPos = built.srcPositions[i];
        return srcPos ?
          removeBufferRingLoops(ring, BUFFER_LOOP_WINDOW, srcPos, turnPrefix) : ring;
      });
    }
  }

  // Build the clean-outline-winding ring for one offset side from the shared
  // traceCleanOffsetSide construction (the same construction the open two-sided
  // line outline uses), then strip self-overlap loops before the dissolve.
  //
  // A closed source ring closes on its first offset vertex: the midpoint seam is
  // collinear (see startRingAtEdgeMidpoint), so the recomputed final offset point
  // is a sub-ULP duplicate of the first and is dropped (done() repeats the first
  // vertex exactly). An open arc appends the final offset endpoint and an end cap.
  //
  // Loop removal: multi-pass dip+coverage (removeBufferRingLoopsIterative with
  // construction dip tags), the same method used for two-sided line outlines.
  function removePolygonOutlineLoops(ring, dipTags, dist) {
    return removeBufferRingLoopsIterative(ring, BUFFER_LOOP_WINDOW,
      null, null, undefined, dipTags, undefined,
      dist * dist * BUFFER_LOOP_FILL_AREA_FRAC);
  }

  function buildCleanOutlineRings(sideVerts, dist) {
    if (sideVerts.length < 2) return [];
    var closed = !pathIsOpen(sideVerts);
    var info = traceCleanOffsetSide(sideVerts, dist);
    var pts = info.points, segs = info.segs, tags = info.dipTags;
    for (var i = 0; i < pts.length; i++) builder.addBufferVertex(pts[i], segs[i], tags[i]);
    if (!closed) {
      if (info.lastPoint) builder.addBufferVertex(info.lastPoint, info.lastSeg);
      if (capStyle == 'round') {
        var end = sideVerts[sideVerts.length - 1];
        builder.addBufferVertices(
          makeRoundCap(end[0], end[1], info.lastBearing - 90, dist), NaN);
      }
    }
    var d = builder.done(true);
    if (!d) return [];
    var mainRing;
    if (opts.no_loop_removal) {
      mainRing = d.ring;
    } else {
      mainRing = removePolygonOutlineLoops(d.ring, d.dipTags, dist);
    }
    var out = [mainRing];
    // Union in a single-segment round-cap patch for every fan-apart concave bend
    // (offsetEdgesFanApart). Each patch is the exact buffer of one source
    // segment, hence a subset of the true buffer, so it can only fill the
    // winding-0 sliver the pinched bridge leaves -- it can never push geometry
    // through the outer wall. Oriented to match the main ring so the winding fill
    // adds (not subtracts) its area.
    if (info.fanApartBends.length) {
      addFanApartGapPatches(out, sideVerts, info.fanApartBends, dist,
        ringSignedArea(mainRing) >= 0);
    }
    return out;
  }

  // Append a round-cap stadium patch for the two source segments meeting at each
  // recorded fan-apart bend vertex. A single segment has no bend (so its buffer
  // is the exact, gap-free stadium); the two patches' caps at the shared vertex
  // cover the sliver wedge the pinched bridge failed to fill.
  function addFanApartGapPatches(out, sideVerts, bends, dist, parentCCW) {
    for (var b = 0; b < bends.length; b++) {
      var k = bends[b];
      if (k - 1 >= 0) pushPatch(out, [sideVerts[k - 1], sideVerts[k]], dist, parentCCW);
      if (k + 1 < sideVerts.length) pushPatch(out, [sideVerts[k], sideVerts[k + 1]], dist, parentCCW);
    }
  }

  function pushPatch(out, seg, dist, parentCCW) {
    if (seg[0][0] === seg[1][0] && seg[0][1] === seg[1][1]) return;
    var ring = makeTwoSidedOutlineRing(seg, dist).ring;
    if ((ringSignedArea(ring) >= 0) !== parentCCW) ring.reverse();
    out.push(ring);
  }

  function ringSignedArea(ring) {
    var s = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return s;
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
        // (The clean-outline-winding grow does NOT reach here -- it is routed to
        // buildCleanOutlineRings, which bridges concave corners with
        // makeConcaveJoin to keep a constant +/-1 winding.)
        builder.addBufferVertex(p2Prev, segId);
        builder.addBufferVertex([x1, y1], segId);
        builder.addBufferVertex(p1, segId);
      } else if (joinAngle > roundJoinSegAngle * 1.5) {
        // Large convex bend: arc vertices on the offset circle replace the
        // previous segment end (p2Prev) and current segment start (p1).
        joinPoints = makeInscribedRoundJoin(x1, y1, bearingPrev - 90, joinAngle, dist);
        builder.addBufferVertices(joinPoints, segId);
        p1 = joinPoints.pop(); // track outgoing segment start (already added)
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

  // Open a closed ring at its first vertex: nudge the corner into two points
  // straddling it along the incoming and outgoing edges (sub-tolerance gap).
  function openClosedRingWithMicroGap(verts) {
    var gap = 1e-6;
    var n = verts.length;
    if (n < 4 || pathIsOpen(verts)) return verts;
    var ring = [], i;
    for (i = 0; i < n; i++) ring.push(verts[i].concat());
    if (ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) ring.pop();
    if (ring.length < 3) return verts;
    var p0 = ring[0], p1 = ring[1], pPrev = ring[ring.length - 1];
    ring[0] = nudgeVertexFrom(p0, p1, gap);
    ring.push(nudgeVertexFrom(p0, pPrev, gap));
    return ring;
  }

  function nudgeVertexFrom(origin, toward, dist) {
    var dx = toward[0] - origin[0], dy = toward[1] - origin[1];
    var len = Math.hypot(dx, dy);
    if (len > 0) {
      return [origin[0] + dx / len * dist, origin[1] + dy / len * dist];
    }
    return [origin[0] + dist, origin[1]];
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
    var zeros = function(arr) { return arr.map(function() { return 0; }); };
    var rightPos = right.srcPos.map(function(p) { return (n - 1) - p; });
    var srcPos = left.srcPos.concat(nan(endCap), rightPos, nan(startCap));
    srcPos.push(srcPos[0]);
    // Parallel reversed-arc ("dip") tags: caps are never dips.
    var dipTags = left.dipTags.concat(zeros(endCap), right.dipTags, zeros(startCap));
    dipTags.push(dipTags[0]);
    // Fan-apart gap-patch bends from both offset sides, as source-vertex indices.
    // A bend is concave from only one side, so the two sides flag disjoint
    // vertices; the right side was traced in reverse, so map its indices back to
    // source order ((n-1) - r).
    var bendSet = {};
    (left.fanApartBends || []).forEach(function(j) { bendSet[j] = 1; });
    (right.fanApartBends || []).forEach(function(j) { bendSet[(n - 1) - j] = 1; });
    var bends = Object.keys(bendSet).map(Number);
    return {ring: ring, srcPos: srcPos, dipTags: dipTags, fanApartBends: bends};
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

  // Shared per-segment offset construction for the constant-radius "clean"
  // buffer outline. Walks the left offset of `verts`, joining adjacent offset
  // segments with inscribed round joins (convex bends), elbow/shallow joins, and
  // reversed makeConcaveJoin arcs (concave bends) -- every emitted vertex stays
  // at distance `dist`, so the traced side keeps a true +/-1 winding. This is
  // the single construction used by BOTH the open two-sided line outline
  // (makeOffsetSide) and the clean-outline-winding polygon grow
  // (buildCleanOutlineRings), so a construction fix lands in one place for both.
  //
  // Returns parallel arrays { points, segs }: each offset vertex (consecutive
  // duplicates dropped) and the source segment it derives from, in trace order.
  // Returning the finished arrays rather than taking a per-vertex `emit` callback
  // keeps the tracer a pure (verts, dist) -> data function (easy to unit-test in
  // isolation) and puts the consecutive-duplicate dedup in one place, so the line
  // and polygon callers can't drift apart on it. (Both styles measure the same;
  // the line caller reuses `points`/`segs` in place, so construction is still a
  // single pass.) The final segment endpoint is NOT pushed; it is returned as
  // `lastPoint` so the caller can either append it (open side) or close the ring
  // on its first
  // vertex (closed outline -- its collinear midpoint seam makes the recomputed
  // final point a sub-ULP duplicate of the first offset vertex, which must be
  // dropped rather than emitted, see makeLeftBufferRings closure notes).
  function traceCleanOffsetSide(verts, dist) {
    var x1, y1, x2, y2, bearing, bearingPrev, joinAngle, hit;
    var p1, p2, p1Prev, p2Prev, firstBearing, lastBearing, joinPoints, i;
    var points = [], segs = [], dipTags = [], fanApartBends = [];
    var vertsSegIndex = null;
    // tag: 1 marks a vertex emitted as part of a reversed concave-join arc
    // (the "dip" the construction inserts when adjacent offset segments do not
    // meet locally). These runs are pure self-overlap artifacts, so loop
    // removal can key on them directly instead of guessing from ring geometry.
    function add(p, segId, tag) {
      var prev = points[points.length - 1];
      if (prev && prev[0] === p[0] && prev[1] === p[1]) return;
      points.push(p);
      segs.push(segId);
      dipTags.push(tag ? 1 : 0);
    }
    var concaveJoin = opts.coarse_bridge ? makeCoarseConcaveJoin : makeConcaveJoin;
    for (var segId = 0; segId < verts.length - 1; segId++) {
      x1 = verts[segId][0];
      y1 = verts[segId][1];
      x2 = verts[segId + 1][0];
      y2 = verts[segId + 1][1];
      bearing = bearingDegrees2D(x1, y1, x2, y2);
      p1 = getOffsetPoint(x1, y1, bearing - 90, dist);
      p2 = getOffsetPoint(x2, y2, bearing - 90, dist);
      if (segId === 0) {
        add(p1, segId);
        firstBearing = bearing;
      } else {
        joinAngle = getJoinAngle(bearingPrev, bearing);
        if (joinAngle > roundJoinSegAngle * 1.5) {
          joinPoints = makeInscribedRoundJoin(x1, y1, bearingPrev - 90, joinAngle, dist);
          for (i = 0; i < joinPoints.length; i++) add(joinPoints[i], segId);
          p1 = joinPoints[joinPoints.length - 1];
        } else if (joinAngle > -1e-10 && joinAngle < 1e-10) {
          add(p1, segId);
        } else if (joinAngle > 0 && (hit = elbowJoin(p1Prev, p2Prev, p1, p2,
            bearingPrev, bearing, x1, y1, dist)) ||
            joinAngle < 0 && (hit = bufferSegmentIntersection(p1Prev, p2Prev, p1, p2))) {
          add(hit, segId);
          p1 = hit;
        } else if (joinAngle > 0) {
          add(p1, segId);
        } else if (joinAngle < 0 && (hit = shallowAngleJoin(p2Prev, p1, x1, y1, dist))) {
          add(hit, segId);
          p1 = hit;
        } else {
          add(p2Prev, segId, 1);
          joinPoints = concaveJoin(x1, y1, bearing - 90, -joinAngle, dist);
          if (useGapPatch(opts, useMercator) &&
              offsetEdgesFanApart(p1Prev, p2Prev, p1, p2)) {
            if (!vertsSegIndex) vertsSegIndex = buildVertsSegmentIndex(verts);
            if (wedgeIsExposed(vertsSegIndex, segId - 1, segId, x1, y1,
                joinPoints, p2Prev, p1)) {
              fanApartBends.push(segId);
            }
          }
          for (i = 0; i < joinPoints.length; i++) add(joinPoints[i], segId, 1);
          add(p1, segId, 1);
        }
      }
      bearingPrev = bearing;
      p1Prev = p1;
      p2Prev = p2;
      lastBearing = bearing;
    }
    return {
      points: points,
      segs: segs,
      dipTags: dipTags,
      fanApartBends: fanApartBends,
      firstBearing: firstBearing,
      lastBearing: lastBearing,
      lastPoint: p2Prev,
      lastSeg: verts.length - 1
    };
  }

  function makeOffsetSide(verts, dist) {
    // Thin wrapper over the shared traceCleanOffsetSide construction. The tracer
    // already returns the deduped offset polyline (points[]) and a parallel
    // srcPos[] of each point's source segment (so loop removal can judge a
    // self-crossing by the turn of the originating path span rather than by the
    // unreliable geometry of the offset itself), so we reuse those arrays in
    // place and only append the final segment endpoint here (with the same
    // consecutive-duplicate guard); endpoint caps are added by the caller.
    var info = traceCleanOffsetSide(verts, dist);
    var points = info.points;
    var srcPos = info.segs;
    var dipTags = info.dipTags;
    var last = info.lastPoint;
    if (last) {
      var prev = points[points.length - 1];
      if (!prev || prev[0] !== last[0] || prev[1] !== last[1]) {
        points.push(last);
        srcPos.push(info.lastSeg);
        dipTags.push(0);
      }
    }
    return {
      points: points,
      srcPos: srcPos,
      dipTags: dipTags,
      fanApartBends: info.fanApartBends,
      firstBearing: info.firstBearing,
      lastBearing: info.lastBearing
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
  // buffer by at most the interval (see getBufferSimplifyFunction for the
  // empirical calibration). D.P. retains locally extreme vertices (the ones
  // that determine the outline), so the typical deviation is much smaller.
  // End-segment bearings are pinned (kk[1] and kk[n-2]) so cap geometry
  // stays exact. Collapsed paths fall back to their original vertices: a
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
    var verts2 = [];
    for (i = 0; i < n; i++) {
      if (kk[i] >= interval) verts2.push(verts[i]);
    }
    var closed = verts[0][0] === verts[n-1][0] && verts[0][1] === verts[n-1][1];
    return verts2.length >= (closed ? 4 : 2) ? verts2 : verts;
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

  // Inscribed round join: vertices on the offset arc at equal angle steps,
  // each at the true offset distance (geodesic or planar).
  function makeInscribedRoundJoin(cx, cy, startBearing, arcAngle, dist) {
    var pointCount = Math.max(1, Math.round(arcAngle / roundJoinSegAngle));
    var stepAngle = arcAngle / pointCount;
    var points = [];
    for (var i = 1; i <= pointCount; i++) {
      points.push(getOffsetPoint(cx, cy, startBearing + stepAngle * i, dist));
    }
    return points;
  }

  // True when the two consecutive offset edges of a negative-angle (concave)
  // bend do not overlap but instead diverge: the infinite-line intersection of
  // the incoming edge (a->b) and outgoing edge (c->d) lies behind the incoming
  // edge (t < 0) and beyond the outgoing edge (u > 1). A planar concave bend
  // always overlaps (the crossing is in front: t > 1, u < 0); this fan-apart
  // configuration only arises when a variable geodesic offset distance stretches
  // the two edges past each other, leaving the outer-edge gap we want to bridge
  // with a forward round join instead of a reversed (doubling-back) arc.
  function offsetEdgesFanApart(a, b, c, d) {
    var rx = b[0] - a[0], ry = b[1] - a[1];
    var sx = d[0] - c[0], sy = d[1] - c[1];
    var den = rx * sy - ry * sx;
    if (den === 0) return false; // parallel: keep the reversed bridge
    var wx = c[0] - a[0], wy = c[1] - a[1];
    var t = (wx * sy - wy * sx) / den;
    var u = (wx * ry - wy * rx) / den;
    return t < 0 && u > 1;
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

  // Coarse alternative to makeConcaveJoin (selected by opts.coarse_bridge in
  // traceCleanOffsetSide): bridges a concave bend with as few as one reversed
  // arc vertex (CLEAN_OUTLINE_BRIDGE_STEP), producing a smaller ring for the
  // winding dissolve to chew through. The reversed bridge only bounds a self-
  // overlap loop the direction remover collapses, so the coarser resolution
  // does not change the final boundary -- it just trades a little construction
  // fidelity for dissolve speed.
  function makeCoarseConcaveJoin(cx, cy, startBearing, arcAngle, dist) {
    var segs = Math.min(roundJoinSegsPerQuadrant,
      Math.max(1, Math.ceil(arcAngle / CLEAN_OUTLINE_BRIDGE_STEP)));
    var points = [];
    var increment = arcAngle / (segs + 1);
    for (var i = 1; i <= segs; i++) {
      points.push(getOffsetPoint(cx, cy, startBearing + increment * i, dist));
    }
    return points.reverse();
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

