import {
  dissolveBufferDataset2,
  getBufferDistanceFunction,
  getBufferToleranceFunction,
  getOutlineBufferDissolveOpts,
  parseConstantBufferDistance
} from '../buffer/mapshaper-buffer-common';
import { getDatasetCRS, getDatasetCrsInfo, setDatasetCrsInfo, isLatLngCRS } from '../crs/mapshaper-projections';
import { importGeoJSON } from '../geojson/geojson-import';
import { getPolylineBufferMaker } from '../buffer/mapshaper-path-buffer-v4';
import { splitAntimeridianBufferDataset, applyOutlineArtifactHoleFilter } from '../buffer/mapshaper-polyline-buffer';
import {
  buildInterFeatureMedialLines,
  buildInterFeatureDelaunay
} from '../buffer/mapshaper-buffer-voronoi';
import { clipLayersByBBox, clipLayersInPlace } from '../commands/mapshaper-clip-erase';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { copyDataset } from '../dataset/mapshaper-dataset-utils';
import { parseMeasure2 } from '../geom/mapshaper-units';
import { getPathCentroid } from '../points/mapshaper-polygon-centroid';
import { R, R2D, pointSegDistSq2 } from '../geom/mapshaper-basic-geom';
import { getPointToShapeDistance } from '../geom/mapshaper-path-geom';
import { getShapeArea, getPlanarPathArea, getPlanarPathArea2, getSphericalPathArea2 } from '../geom/mapshaper-polygon-geom';
import { countCrosses, splitPathAtAntimeridian } from '../geom/mapshaper-antimeridian-cuts';
import { exportPathData } from '../paths/mapshaper-path-export';
import { reversePath } from '../paths/mapshaper-path-utils';
import { getRingIntersector } from '../paths/mapshaper-pathfinder';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { buildTopology } from '../topology/mapshaper-topology';
import { dissolvePolygonLayer2 } from '../dissolve/mapshaper-polygon-dissolve2';
import { fixNestingErrors, groupPolygonRings } from '../polygons/mapshaper-ring-nesting';
import { PathIndex } from '../paths/mapshaper-path-index';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';
import { getArcClassifier } from '../topology/mapshaper-arc-classifier';
import { findAnchorPoint } from '../points/mapshaper-anchor-points';
import { profileStart, profileEnd } from '../utils/mapshaper-profile';
import { message, stop, warn } from '../utils/mapshaper-logging';

export function makePolygonBuffer(lyr, dataset, opts) {
  var spherical = isLatLngCRS(getDatasetCRS(dataset));
  if (spherical && sourceHasCollapsingBandEdge(lyr, dataset)) {
    // A ring edge that jumps a full 360 degrees of longitude (e.g. -180 -> 180)
    // with no intermediate vertices is ambiguous: the antimeridian unwrap reads
    // its delta as 0, collapsing the edge's endpoints onto one meridian in
    // Mercator, so the offset returns a sliver. (Pole-encircling rings and
    // pole floors are exempt -- see sourceHasCollapsingBandEdge.) Warn rather
    // than silently collapse; densifying the edge fixes it.
    warn('A polygon edge spans the full longitude range with no intermediate vertices and will collapse when buffered. Add vertices along the edge (e.g. densify it) before buffering.');
  }
  if (spherical && !opts.polar && sourceHasPoleEnclosingRing(lyr, dataset)) {
    // A lat-long polygon whose ring encircles a pole (e.g. an Antarctica shell)
    // has no closed planar representation: projected to Mercator and unwrapped
    // across the antimeridian, its endpoints land a full world-width apart, so
    // the offset construction reads the ring as an open line and returns a
    // two-sided ribbon instead of a grown polygon. Insert a floor along the
    // enclosed pole line so the ring becomes an ordinary closed polygon (the same
    // representation as a pole-touching shell) and route it through polar
    // handling, which grows it correctly and clips the result to the world rect.
    var normalized = buildPoleEnclosingNormalizedSource(lyr, dataset);
    if (normalized) {
      message('Buffering a polygon that encircles a pole; using experimental polar handling.');
      lyr = normalized.layer;
      dataset = normalized.dataset;
      opts = Object.assign({}, opts, {polar: true});
    }
  }
  // debug-mosaic is implemented only for line buffers; for polygons it has no
  // handling and would leak into the per-shape dissolve and corrupt output, so
  // drop it and warn rather than silently mislead.
  if (opts.debug_mosaic) {
    warn('debug-mosaic is not implemented for polygon buffers; ignoring');
    opts = Object.assign({}, opts, {debug_mosaic: false});
  }
  // The clean-outline-winding construction is the default polygon-grow outline
  // and the topological per-feature offset (band-method restores the older band
  // ribbon). Spurious dissolve holes on the default grow are removed by the
  // shared outline artifact-hole filter; gap-patch handles geodesic fan-apart
  // outer-wall gaps at construction time.
  if (!opts.band_method) {
    opts = Object.assign({}, opts, {clean_outline_winding: true});
  }
  if (opts.fill_gaps) {
    // Fill enclosed holes and narrow-mouthed inlets without growing the outer
    // boundary -- a topology-aware morphological closing (see
    // makeGapFillPolygonBuffer). Taken ahead of the debug and polar/normal
    // branches: fill-gaps is inherently topological and builds its medial at the
    // fill radius R, so it owns the debug views too (it re-enters this function
    // at R to produce them) and takes precedence over an explicit topological.
    var fillResult = makeGapFillPolygonBuffer(lyr, dataset, opts);
    // fill-gaps may itself return a debug dataset (it owns the medial debug
    // views); never cull those.
    if (!bufferOutputIsDebug(opts)) {
      cullSubTolerancePolygonArtifacts(fillResult, lyr, dataset, opts);
    }
    return fillResult;
  }
  if (opts.debug_delaunay) {
    // Undocumented: emit the medial-construction triangles (the Delaunay
    // triangles that bridge two features within buffer reach), whose
    // circumcenters are the medial vertices -- the contested ribbon where the
    // medial axis is built, not the full hull triangulation.
    return makeDelaunayDebugDataset(lyr, dataset, opts);
  }
  if (opts.debug_voronoi) {
    // Undocumented: emit the inter-feature medial-axis (Voronoi) cut-lines that
    // the topological pipeline injects to partition contested space, before they
    // are cut into the mosaic and dissolved. Useful for inspecting the medial
    // construction (sampling density, centerline tracking, simplification).
    return makeVoronoiDebugDataset(lyr, dataset, opts);
  }
  if (opts.debug_offset) {
    // Raw offset rings, undissolved (as with the line debug-offset): show the
    // construction's offset loops before the winding/boundary dissolve. Honors
    // no-loop-removal (loop removal runs inside the maker) and band-method, and
    // is taken ahead of the polar branch so it shows the raw clamped offsets
    // rather than the clipped/dissolved polar result.
    var debugDataset = importGeoJSON(
      makePolygonDebugOffsetGeoJSON(lyr, dataset, opts), {type: 'polygon'});
    if (spherical && debugDataset.arcs) {
      splitAntimeridianBufferDataset(debugDataset);
    }
    return debugDataset;
  }
  if (spherical && !opts.polar && polygonBufferNeedsPolarMode(lyr, dataset, opts)) {
    message('Using experimental polar buffer mode because the buffer reaches a pole.');
    opts = Object.assign({}, opts, {polar: true});
  } else if (spherical && !opts.polar && polygonBufferWrapsAntimeridian(lyr, dataset, opts)) {
    // A ring that wraps the full longitude range (e.g. a band around the globe)
    // becomes a world-wide rectangle in Mercator whose long straight edges the
    // default offset construction collapses to thin seam caps. Route it through
    // polar handling, which pins the seam edges and clips to the world rect.
    message('Using experimental polar buffer mode because the geometry wraps around the antimeridian.');
    opts = Object.assign({}, opts, {polar: true});
  }
  if (spherical && opts.polar) {
    // Pole/antimeridian-sliced polygons (grow only): keep the seam edges at the
    // extent and clip to the world rectangle instead of wrapping at the
    // antimeridian (see makePolarPolygonBuffer).
    var polar = makePolarPolygonBuffer(lyr, dataset, opts);
    cullSubTolerancePolygonArtifacts(polar, lyr, dataset, opts);
    return polar;
  }
  var output = buildPolygonBufferOutput(lyr, dataset, opts);
  var dataset2 = importGeoJSON(output.geojson, {type: 'polygon'});
  if (spherical) {
    splitAntimeridianBufferDataset(dataset2);
    if (output.dissolveAfterSplit) {
      dissolveBufferDataset2(dataset2, opts);
    }
  }
  if (useOutlineGrowArtifactFilter(opts)) {
    applyOutlineArtifactHoleFilter(dataset2.layers[0], dataset2.arcs,
      lyr, dataset, opts, spherical, {
        skipShape: function(shape, arcs) {
          return shapeHasFillInsideHole(shape, arcs);
        }
      });
  }
  cullSubTolerancePolygonArtifacts(dataset2, lyr, dataset, opts);
  return dataset2;
}

// True for clean-outline polygon grow and topological (not band-method or debug).
function useOutlineGrowArtifactFilter(opts) {
  return !opts.band_method && !bufferOutputIsDebug(opts);
}

// True when the buffer is producing a debug view (raw offsets or medial
// construction) rather than a real buffer; those must skip the artifact cull.
function bufferOutputIsDebug(opts) {
  return !!(opts.debug_delaunay || opts.debug_voronoi || opts.debug_offset ||
    opts.debug_mosaic);
}

// Sub-tolerance artifact cull. The discrete medial sampling and the fill-gaps
// mask boolean leave a scatter of degenerate, near-zero-area positive sliver
// parts (most egregiously in fill-gaps: e.g. ~160 spurious parts on six
// counties, most of them literally zero area). A part smaller than a tol x tol
// square -- the buffer's own positional accuracy -- is below the noise floor and
// is dropped. The smallest legitimate buffer part (the grow of a point-like
// feature, ~pi*d^2) is ~4 orders of magnitude larger, so the threshold never
// touches real geometry, and a genuinely thin-but-long fill (area =
// tol*length >> tol^2) is kept. Holes are intentionally left alone; the outline
// artifact-hole filter runs after dissolve and keeps legitimate carved holes.
// Disabled when tolerance is turned off (tolerance=0), matching the medial-simplify contract.
export function cullSubTolerancePolygonArtifacts(outDataset, srcLyr, srcDataset, opts) {
  if (opts.tolerance === 0 || opts.tolerance == '0' || opts.tolerance == '0%') return;
  if (!outDataset || !outDataset.arcs) return;
  var lyr = outDataset.layers.filter(function(l) {
    return l.geometry_type == 'polygon';
  })[0];
  if (!lyr || !lyr.shapes) return;
  var arcs = outDataset.arcs;
  var distanceFn = getBufferDistanceFunction(srcLyr, srcDataset, opts);
  var tolFn = getBufferToleranceFunction(srcDataset, opts);
  var crsArcs = srcDataset.arcs || arcs; // CRS-bearing arcs for the unit conversion
  lyr.shapes = lyr.shapes.map(function(shp, i) {
    if (!shp || shp.length === 0) return shp;
    var dist = distanceFn(i);
    if (!(dist > 0)) return shp;
    var tolCoord = getCoordinateDistance(tolFn(dist), crsArcs);
    var minArea = tolCoord * tolCoord;
    if (!(minArea > 0)) return shp;
    var kept = shp.filter(function(ring) {
      var area = getPlanarPathArea(ring, arcs);
      return !(area > 0 && area < minArea); // drop sub-tolerance positive parts
    });
    return kept.length > 0 ? kept : null;
  });
}

// Build the per-shape GeoJSON offset output for a polygon buffer, choosing the
// construction:
// - The clean-outline construction is the default for ordinary polygon grow
//   (outer rings offset to a single self-contained loop; far fewer rings and
//   self-intersections into the winding dissolve than the band ribbon).
// - The band-method escape hatch keeps the band-ribbon construction; the
//   topological pipeline uses the same clean-outline grow (with shared-arc path
//   splitting) unless band-method is set.
// - Negative buffers and hole shrink fall back to the band erode inside the
//   outline path itself.
// Shared by makePolygonBuffer and makePolarPolygonBuffer so the polar option is
// a true no-op on non-polar shapes (same construction as the plain buffer).
function buildPolygonBufferOutput(lyr, dataset, opts) {
  var useOutline = !opts.band_method && !opts.topological;
  return useOutline ?
    makeOutlinePolygonBufferGeoJSON(lyr, dataset, opts) :
    makePolygonBufferGeoJSON(lyr, dataset, opts);
}

// Short unit suffixes for re-emitting a scaled distance string (see
// fillGapsRadiusStr); parseMeasure2 normalizes input units to these canonical
// names. A null (unitless) value is re-emitted bare and interpreted like an
// unsuffixed radius (meters for lat-long, CRS units for projected).
var GAP_FILL_UNIT_SUFFIX = {
  meters: 'm',
  kilometers: 'km',
  feet: 'ft',
  miles: 'mi'
};

// Default max-widening factor: an interior gap is kept open only if it is at
// least this many times wider than the mouth size; narrower gaps are filled. Set
// well above 1 so the closing does not leave a string of small holes along a
// channel whose width fluctuates around the mouth size (e.g. the Columbia).
var GAP_MAX_WIDENING_DEFAULT = 5;

// The mouth size for the gap fill is the buffer distance (the standard radius
// option), which must be a positive constant.
function parseFillGaps(opts) {
  var parsed = parseMeasure2(opts.radius);
  if (!(parsed.value > 0)) {
    stop('The fill-gaps option requires a positive buffer distance');
  }
  return parsed;
}

// Build a radius string of (mouthSize/2 * factor) preserving the input units, so
// the sub-buffers' own unit/CRS conversion applies (matching how -buffer radius
// is parsed). factor 1 gives the mouth radius r = mouthSize/2 (two banks of a
// channel narrower than the mouth size, 2r, meet under a grow of r); factor k
// (the max-widening multiple) gives the larger fill radius R = k*mouthSize/2.
function fillGapsRadiusStr(parsed, factor) {
  return String(parsed.value * factor / 2) +
    (GAP_FILL_UNIT_SUFFIX[parsed.units] || '');
}

// max-widening: keep an interior gap open only if it is wider than this multiple
// of the fill-gaps mouth size (default GAP_MAX_WIDENING_DEFAULT). Must be >= 1
// (the threshold cannot be narrower than the mouth itself).
function getGapMaxWideningFactor(opts) {
  if (opts.max_widening == null) return GAP_MAX_WIDENING_DEFAULT;
  var k = Number(opts.max_widening);
  if (!(k >= 1)) {
    stop('The max-widening option must be a number >= 1');
  }
  return k;
}

// Fill enclosed holes and narrow-mouthed inlets of a polygon mosaic (e.g. a
// river up to its mouth) without growing the outer boundary. This is a
// topology-aware morphological closing of the mosaic with two thresholds:
//   - the mouth radius r = mouthSize/2 gates which gaps are sealed off from the
//     open coast (only openings narrower than the mouth size are closed);
//   - the fill radius R = k*mouthSize/2 (k = max-widening factor) controls how
//     far into a sealed inlet the fill reaches and how wide an interior gap must
//     be to stay open.
// Steps:
//   - the topological buffer grows every feature by R and partitions the
//     contested space by nearest source (the per-feature dilation, T_R); this
//     covers every interior gap narrower than k*mouthSize and splits it down the
//     medial axis;
//   - the mask is the closing of the land by the mouth radius r: dilate the land
//     by r, union it (D_r), erode by r. The mask is the original land plus any
//     gap narrower than the mouth size, with the outward collar pulled back to
//     the source outline; its interior holes are the gaps wider than the mouth
//     that lie behind a narrow mouth (rivers' wide reaches, enclosed lakes);
//   - holes of the mask narrower than k*mouthSize are filled (their max
//     inscribed circle is smaller than R), so only genuinely large open bodies
//     (e.g. the Great Lakes) stay open;
//   - clipping T_R to the filled mask drops the R-wide collar and the kept-open
//     bodies but keeps each feature's original area plus its medial share of the
//     narrow-gap fill.
// Feature order is preserved so source attributes stay aligned.
function makeGapFillPolygonBuffer(lyr, dataset, opts) {
  var parsed = parseFillGaps(opts);
  var k = getGapMaxWideningFactor(opts);
  var mouthRadius = fillGapsRadiusStr(parsed, 1);  // r = mouthSize/2
  var fillRadius = fillGapsRadiusStr(parsed, k);   // R = k*mouthSize/2
  var baseOpts = Object.assign({}, opts, {fill_gaps: false, max_widening: null});
  // fill-gaps is inherently topological and builds its partition at the larger
  // fill radius R, so every sub-buffer overrides the radius (and turns on the
  // topological pipeline for the fill dilation) regardless of the flags the user
  // passed -- topological need not be given explicitly.
  var fillOpts = Object.assign({}, baseOpts, {radius: fillRadius, topological: true});
  // Fill + medial partition at R so interior pockets up to k*mouthSize wide are
  // covered and split by nearest source.
  var dilated = makePolygonBuffer(lyr, dataset, fillOpts);
  // The medial debug views (debug-delaunay/-voronoi) and debug-offset short-
  // circuit makePolygonBuffer and return their construction directly; since
  // fill-gaps builds at R, that early return IS the debug output we want, so
  // pass it straight through instead of trying to mask/clip a debug dataset.
  if (opts.debug_delaunay || opts.debug_voronoi || opts.debug_offset) {
    return dilated;
  }
  var dilatedLyr = dilated.layers[0];
  if (!dilatedLyr || !dilated.arcs) return dilated;
  // Mouth-gating mask: closing of the land by the mouth radius r (dilate by r,
  // union, erode by r). Built separately from the fill dilation because the
  // mouth threshold stays at the mouth size while the fill reaches further.
  var dilatedAtR = makePolygonBuffer(lyr, dataset,
    Object.assign({}, baseOpts, {radius: mouthRadius, topological: false}));
  var union = unionBufferDataset(dilatedAtR, baseOpts);
  if (!union || !union.arcs) return dilated;
  // tolerance: 0 disables the buffer's Douglas-Peucker pre-simplification for the
  // erosion. Pre-simplifying before an INWARD offset can push a simplified concave
  // vertex past its neighbours and self-intersect the eroded ring; on a large,
  // dense outline (e.g. a whole-country coastline) the dissolve then keeps the
  // wrong side and the ring collapses, wiping the gap-fill extent. The dilation
  // stays pre-simplified (outward offsets don't fold this way) so only the fragile
  // erode pays the full-resolution cost.
  var closing = makePolygonBuffer(union.layers[0], union,
    Object.assign({}, baseOpts, {radius: '-' + mouthRadius, topological: false,
      tolerance: 0}));
  if (!closing || !closing.arcs) return dilated;
  // Fill the mask's interior gaps that are narrower than k*mouthSize (keep wider
  // ones open) so the clip below fills them too.
  var keepRadius = getCoordinateDistance(
    parseConstantBufferDistance(fillRadius, getDatasetCRS(dataset)) || 0,
    closing.arcs);
  fillNarrowMaskHoles(closing, keepRadius);
  // Additive mask. The closing defines the correct fill EXTENT, but its
  // dilate/erode round trip reshapes the whole outer boundary (round joins on
  // convex corners don't invert exactly) and bridges shallow scallops that are not
  // real gaps. So don't clip to the closing directly: build the clip mask as
  // (source land) UNION (the closing's genuine gap fills), taking the outer
  // boundary from the source's own arcs so protrusions and the open coast come
  // through unchanged. The union is built by noding the source together with the
  // gap fills in a single topology (see buildAdditiveFillMask), so the shared
  // coastline is split at the gap mouths and no sliver can open at a seam.
  var fillMask = buildAdditiveFillMask(closing, lyr, dataset, opts, keepRadius) || closing;
  // Carry the source attributes through the clip: clipping drops fully-empty
  // features, so attach a per-feature data table (aligned 1:1 with the dilation)
  // before clipping rather than relying on a post-hoc count-match copy.
  if (lyr.data && dilatedLyr.shapes &&
      dilatedLyr.shapes.length == lyr.data.size()) {
    dilatedLyr.data = lyr.data.clone();
  }
  // remove_slivers: the dilation-vs-mask clip can carve thin slivers along the
  // medial partition; clip's own sliver filter drops rings that mix dilation and
  // mask arcs and fail a compactness-weighted area test, leaving the substantial
  // fill regions intact.
  clipLayersInPlace(dilated.layers, fillMask, dilated, 'clip',
    {no_cleanup: true, no_warn: true, remove_slivers: true});
  return dilated;
}

// Remove interior rings (holes) of the closing mask whose largest inscribed
// circle has radius smaller than keepRadius, i.e. gaps narrower than 2*keepRadius
// (= k*mouthSize). Dropping the hole ring makes the mask solid there, so the
// clip fills the gap; wide gaps (large lakes) keep their ring and stay open. The
// inscribed radius is estimated from the gap's pole of inaccessibility (the
// anchor point), the same way label points are placed. Modifies the mask in
// place; the clip rebuilds topology afterward, so dropped rings need no cleanup.
function fillNarrowMaskHoles(maskDataset, keepRadius) {
  var arcs = maskDataset.arcs;
  var lyr = maskDataset.layers[0];
  if (!lyr || !arcs || !(keepRadius > 0)) return;
  lyr.shapes = (lyr.shapes || []).map(function(shape) {
    if (!shape) return shape;
    var kept = [];
    exportPathData(shape, arcs, 'polygon').pathData.forEach(function(path) {
      if (path.area >= 0) {
        kept.push(path.ids.concat()); // outer ring: always keep
        return;
      }
      // hole: keep only if wide enough to hold a disk of radius keepRadius
      var holeShape = [reversePath(path.ids.concat())];
      var anchor = findAnchorPoint(holeShape, arcs);
      var radius = anchor ?
        getPointToShapeDistance(anchor.x, anchor.y, holeShape, arcs) : 0;
      if (radius >= keepRadius) {
        kept.push(path.ids.concat());
      }
    });
    return kept.length > 0 ? kept : null;
  });
}

// A gap should be an inlet, not gentle coastline texture. The mouth-gating
// closing bridges EVERY concavity a disk of radius r cannot reach, so shallow
// scallops with a sub-mouth-size opening get sealed and filled like real inlets.
// A bridged open-coast concavity is a genuine gap when it is either convoluted
// (its coastline arc is at least INLET_MIN_RATIO times its mouth chord) or
// genuinely deep (its greatest depth is at least INLET_MIN_DEPTH_RATIO of its
// mouth chord). Requiring EITHER keeps winding rivers (long arc, short mouth) and
// deep-but-smooth embayments (large sagitta), while dropping shallow scallops
// that fail both. Enclosed fills (rivers behind a mouth, lakes) have no
// open-water bridge and are always kept.
var INLET_MIN_RATIO = 1.5;       // coastline-arc / mouth-chord (perimeter/chord)
var INLET_MIN_DEPTH_RATIO = 0.5; // max inlet depth / mouth-chord (sagitta/chord)
// A genuine gap must penetrate the coast by a real distance, not just dimple it.
// Two shallow-but-wide artifacts otherwise slip through the ratio test above: the
// thin reshaping collar left where the closing sits ~1% of the mouth radius
// outside a convex coast, and broad shallow scallops whose naturally wiggly shore
// clears the arc/mouth tortuosity clause despite little depth. Requiring the patch
// depth to reach this fraction of the mouth radius drops both while keeping real
// inlets (which run far deeper than their mouth radius; on the Columbia the kept
// gaps reach depth/r >= 1.3, the shallow scallops only ~0.2).
var INLET_MIN_ABS_DEPTH = 0.3;   // min patch depth as a fraction of the mouth radius

// Island-bridge classification of a fill that joins >= 2 source parts, one small
// (see bridgesSmallIsland). Two independent signatures mark an island bridge:
//  1. a COMPACT strait -- coastline only a few times its mouth (ex1 ~2.5-3.3, two
//     islands across a channel ~3.7-4.3) -- with the small landmass forming a real
//     share of the shore. A deep/winding river runs many times its mouth (>13),
//     so the arc/mouth cap excludes it; the coast-fraction floor excludes a gap
//     between large landmasses that merely grazes a tiny island.
//  2. a shore with a SUBSTANTIAL share of small islands -- islands (a cluster, or
//     a couple bridged to the mainland) form a large fraction of the fill's
//     coastline rather than an incidental graze. This catches fills that are
//     convoluted enough (high arc/mouth) to look like a river by shape alone. A
//     genuine river runs mostly along the mainland (small share <= 0.17), well
//     below the threshold; an island bridge's small share is 0.3+.
var ISLAND_MIN_COAST_FRAC = 0.1;       // compact-strait floor (small part is a real bank)
var ISLAND_MAX_ARC_RATIO = 8;          // compact-strait cap (above this = river)
var ISLAND_DOMINANT_COAST_FRAC = 0.25; // islands are a substantial share of the shore

// Build the clip mask for fill-gaps as (source land) UNION (genuine gap fills).
// The gap fills are the parts of (closing - land) that isShallowInlet keeps (deep
// or convoluted inlets and enclosed fills), dropping the thin reshaping collar and
// shallow scallops. The mask's outer boundary is the source's own coordinates, so
// protrusions and the open coast are not reshaped by the closing's round joins.
// Returns a single-layer polygon dataset, or null if there is nothing to mask.
//
// The source land and the gap fills are unioned in ONE noded topology: the source
// rings and the fill rings are placed in a single dataset and re-noded together so
// the shared coastline is split at every gap mouth. That is what keeps the seams
// closed -- if the source were noded separately from the fills (two coordinate
// sources merged only at clip time) a fill's mouth-corner point could land just
// off a pristine source edge and open a hairline sliver between the fill and land.
function buildAdditiveFillMask(closing, sourceLyr, sourceDataset, opts, keepRadius) {
  // gap fills = closing - land, on a throwaway copy so the closing stays intact.
  var notchDataset = copyDataset(closing);
  clipLayersInPlace(notchDataset.layers,
    {layers: [sourceLyr], arcs: sourceDataset.arcs}, notchDataset, 'erase',
    {no_cleanup: true, no_warn: true});
  var notchLyr = notchDataset.layers[0];
  if (!notchLyr || !notchDataset.arcs) return null;
  var mouthMeters = parseConstantBufferDistance(
    fillGapsRadiusStr(parseFillGaps(opts), 1), getDatasetCRS(sourceDataset)) || 0;
  var mouthCoord = getCoordinateDistance(mouthMeters, closing.arcs);
  // a fill edge lies on the coastline when its midpoint sits on the source
  // boundary; the bridge is offset into open water by the inlet depth. Tolerance
  // is a small fraction of the mouth radius (above floating-point noise on shared
  // edges, well below the shallowest fillable depth).
  var onSrcTol = mouthCoord * 0.005;
  if (!(onSrcTol > 0)) return null;
  // Grid the coastline once so each fill edge's coast/part test is a local lookup
  // instead of a scan of every source segment (there can be 100k+ of each). The
  // segments carry a part id so a fill can be attributed to the landmass it hugs.
  var spherical = isLatLngCRS(getDatasetCRS(sourceDataset));
  var parts = collectSourceParts(sourceLyr.shapes, sourceDataset.arcs, spherical);
  var srcGrid = buildSegmentGrid(parts.segs, onSrcTol);
  // Unless merge-islands is set, a fill that bridges a small isolated landmass
  // (smaller than a mouth-radius disk) to a neighbor is dropped, so islands stay
  // separate. Genuine gaps between large landmasses (e.g. a river between two
  // states) are unaffected. The disk area is in the same true units as the part
  // areas (mouthMeters is the mouth radius in the dataset's distance units).
  var mergeIslands = !!opts.merge_islands;
  var islandMaxArea = Math.PI * mouthMeters * mouthMeters;
  var geometries = [];
  (sourceLyr.shapes || []).forEach(function(shp) {
    if (!shp) return;
    getPolygonMultiPolygonCoords(shp, sourceDataset.arcs).forEach(function(rings) {
      geometries.push({type: 'Polygon', coordinates: rings});
    });
  });
  var debugInlet = typeof process !== 'undefined' && process.env &&
    process.env.MAPSHAPER_DEBUG_INLET;
  // Island-bridge patches aren't dropped whole: a long fill can hug the mainland
  // (filling its inlets) while also bridging a nearby island. Such patches are set
  // aside, then trimmed by the islands' mouth-radius reach (see trimIslandBridges)
  // so the strait to the island is removed but the mainland-side fill survives.
  var bridgeGeoms = [];
  (notchLyr.shapes || []).forEach(function(shape) {
    if (!shape) return;
    getPolygonMultiPolygonCoords(shape, notchDataset.arcs).forEach(function(rings) {
      if (rings[0] && rings[0].length >= 4) {
        var island = !mergeIslands &&
          bridgesSmallIsland(rings[0], srcGrid, parts.areas, onSrcTol, islandMaxArea);
        var reject = island || isShallowInlet(rings[0], srcGrid, onSrcTol, mouthCoord);
        if (debugInlet) {
          var m = inletMetrics(rings[0], srcGrid, onSrcTol);
          if (m) {
            var ib = islandBridgeMetrics(rings[0], srcGrid, parts.areas, onSrcTol, islandMaxArea);
            console.error('[inlet] ' + (reject ? 'REJECT' : 'KEEP  ') +
              (island ? ' ISLAND' : '') +
              ' arc/mouth=' + (m.arc / m.mouth).toFixed(2) +
              ' depth/mouth=' + (m.depth / m.mouth).toFixed(2) +
              ' depth/r=' + (m.depth / mouthCoord).toFixed(2) +
              ' runs=' + m.bridgeRuns +
              ' parts=' + ib.count + ' smallFrac=' + ib.smallFrac.toFixed(2) +
              ' mouth_m=' + (m.mouth / mouthCoord * mouthMeters).toFixed(0));
          } else {
            console.error('[inlet] KEEP   enclosed (no bridge)');
          }
        }
        if (island) bridgeGeoms.push({type: 'Polygon', coordinates: rings});
        else if (!reject) geometries.push({type: 'Polygon', coordinates: rings});
      }
    });
  });
  trimIslandBridges(bridgeGeoms, sourceLyr, sourceDataset, opts, spherical,
    islandMaxArea, geometries);
  if (geometries.length === 0) return null;
  var mask = importGeoJSON({type: 'GeometryCollection', geometries: geometries},
    {type: 'polygon'});
  // Node the land and the fills together and dissolve into one coverage region.
  // buildTopology + addIntersectionCuts split the shared coastline at the gap
  // mouths so the abutting land and fill rings share those vertices; the dissolve
  // then merges them without leaving a mouth-corner sliver.
  buildTopology(mask);
  addIntersectionCuts(mask, {});
  var dissolved = dissolvePolygonLayer2(mask.layers[0], mask, {quiet: true, silent: true});
  mask.layers = [dissolved];
  // Where the source coastline pinches to a point (coincident vertices, common in
  // multipolygon coastlines) the union of land and a gap fill can leave a hairline
  // sliver hole at the mouth corner. Such a hole is far narrower than the mouth,
  // and fill-gaps by definition should not leave a sub-mouth-width hole open, so
  // the same narrow-hole fill applied to the closing removes these seam slivers;
  // genuine wide holes (open lakes) stay open.
  fillNarrowMaskHoles(mask, keepRadius);
  return mask;
}

// Recover the mainland-side fill from island-bridge patches. Each such patch was
// set aside because it joins a small island to a neighbor, but the same patch can
// also fill genuine inlets along the neighboring mainland. Erasing the islands'
// mouth-radius reach (island (+) r, exactly the island's share of the closing)
// severs the strait -- every point within r of an island, i.e. the whole bridge
// for a channel up to 2r wide -- while leaving the mainland-side fill (> r from
// any island) to be added to the mask. The island therefore stays a separate
// polygon, but its inlets no longer vanish with the discarded bridge.
//
// The recovered fills are pushed into `geometries`. Only protected islands (parts
// below islandMaxArea) are buffered, and only when bridge patches exist, so the
// extra buffer+erase is bounded by the island count and skipped entirely on data
// with no island bridges.
function trimIslandBridges(bridgeGeoms, sourceLyr, sourceDataset, opts, spherical,
    islandMaxArea, geometries) {
  if (bridgeGeoms.length === 0) return;
  var islandGeoms = [];
  (sourceLyr.shapes || []).forEach(function(shp) {
    if (!shp) return;
    getPolygonMultiPolygonCoords(shp, sourceDataset.arcs).forEach(function(rings) {
      if (rings[0] && Math.abs(ringTrueArea(rings[0], spherical)) < islandMaxArea) {
        islandGeoms.push({type: 'Polygon', coordinates: [rings[0]]});
      }
    });
  });
  if (islandGeoms.length === 0) return;
  var crsInfo = getDatasetCrsInfo(sourceDataset);
  var mouthRadiusStr = fillGapsRadiusStr(parseFillGaps(opts), 1);
  var islandDataset = importGeoJSON(
    {type: 'GeometryCollection', geometries: islandGeoms}, {type: 'polygon'});
  setDatasetCrsInfo(islandDataset, crsInfo);
  var islandBuf = makePolygonBuffer(islandDataset.layers[0], islandDataset,
    Object.assign({}, opts, {fill_gaps: false, max_widening: null,
      radius: mouthRadiusStr, topological: false, no_replace: true}));
  if (!islandBuf || !islandBuf.arcs) return;
  var bridgeDataset = importGeoJSON(
    {type: 'GeometryCollection', geometries: bridgeGeoms}, {type: 'polygon'});
  setDatasetCrsInfo(bridgeDataset, crsInfo);
  clipLayersInPlace(bridgeDataset.layers, islandBuf, bridgeDataset, 'erase',
    {no_cleanup: true, no_warn: true});
  (bridgeDataset.layers[0].shapes || []).forEach(function(shape) {
    if (!shape) return;
    getPolygonMultiPolygonCoords(shape, bridgeDataset.arcs).forEach(function(rings) {
      if (rings[0] && rings[0].length >= 4) {
        geometries.push({type: 'Polygon', coordinates: rings});
      }
    });
  });
}

// Classify a bridged concavity (outer ring of a closing-minus-land part) and
// return true when it is NOT a genuine gap -- a shallow scallop or the thin
// reshaping collar -- and so should be excluded from the additive mask.
function isShallowInlet(ring, srcGrid, tol, mouthCoord) {
  var m = inletMetrics(ring, srcGrid, tol);
  if (!m) return false; // enclosed fill or degenerate: keep it
  // the thin reshaping collar (near-zero depth relative to the mouth radius) is
  // not a gap, regardless of its aspect ratio
  if (mouthCoord > 0 && m.depth < INLET_MIN_ABS_DEPTH * mouthCoord) return true;
  return m.arc / m.mouth < INLET_MIN_RATIO && m.depth / m.mouth < INLET_MIN_DEPTH_RATIO;
}

// Measure a bridged concavity. Returns null for a fully enclosed fill (no
// open-water bridge -- a river reach or lake, always a genuine gap) or a
// degenerate ring; otherwise {mouth, arc, depth, bridgeRuns} where the mouth is
// the chord across the longest bridge run, arc is the coastline length, depth is
// the max distance of the coast from the mouth chord, and bridgeRuns is the
// count of distinct open-water runs (>= 2 means a strait between two shores).
function inletMetrics(ring, srcGrid, tol) {
  var n = ring.length - 1; // edge count (ring is closed: ring[n] == ring[0])
  if (n < 3) return null;
  // coast[i] = edge i lies on the source coastline (vs the open-water bridge)
  var coast = [];
  for (var i = 0; i < n; i++) {
    var mx = (ring[i][0] + ring[i + 1][0]) / 2, my = (ring[i][1] + ring[i + 1][1]) / 2;
    coast[i] = segmentGridWithin(srcGrid, mx, my, tol);
  }
  // The mouth is the longest run of bridge (non-coast) edges; no bridge means a
  // fully enclosed fill (river reach, lake) -- always a genuine gap, keep it.
  var run = longestFalseRun(coast);
  if (!run) return null;
  var c1 = ring[run.start], c2 = ring[(run.end + 1) % n];
  var mouth = ptDist(c1[0], c1[1], c2[0], c2[1]);
  if (!(mouth > tol)) return null;
  var arc = 0, depth = 0;
  for (i = 0; i < n; i++) {
    if (inCyclicRun(i, run.start, run.end, n)) continue; // bridge edge
    arc += ptDist(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
    var d = ptLineDist(ring[i][0], ring[i][1], c1[0], c1[1], c2[0], c2[1]);
    if (d > depth) depth = d;
  }
  return {mouth: mouth, arc: arc, depth: depth, bridgeRuns: countFalseRuns(coast)};
}

// Count distinct cyclic runs of falsey (bridge) edges.
function countFalseRuns(flags) {
  var n = flags.length, runs = 0, i;
  for (i = 0; i < n; i++) {
    if (!flags[i] && flags[(i - 1 + n) % n]) runs++;
  }
  // all-false ring: one run that wraps entirely
  if (runs === 0 && !flags[0]) return 1;
  return runs;
}

// Longest cyclic run of falsey entries; returns {start, end} inclusive edge
// indices (end may be < start when the run wraps), or null if none are false.
function longestFalseRun(flags) {
  var n = flags.length, best = null, bestLen = 0, i, len, start;
  // scan up to 2n to allow a run to wrap the seam
  i = 0;
  while (i < 2 * n) {
    if (flags[i % n]) { i++; continue; }
    start = i;
    while (i < 2 * n && !flags[i % n] && (i - start) < n) i++;
    len = i - start;
    if (len > bestLen) { bestLen = len; best = {start: start % n, end: (i - 1) % n}; }
    if (len >= n) break; // all false
  }
  return best;
}

function inCyclicRun(i, start, end, n) {
  return start <= end ? (i >= start && i <= end) : (i >= start || i <= end);
}

function ptDist(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
}

// Perpendicular distance from (px,py) to the infinite line through a and b.
function ptLineDist(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
  if (!(len > 0)) return ptDist(px, py, ax, ay);
  return Math.abs((px - ax) * dy - (py - ay) * dx) / len;
}

// Uniform grid over boundary segments for a fast "is this point within `tol` of
// the coastline?" test. The coast/bridge classification queries it once per notch
// edge -- tens to hundreds of thousands of times against 100k+ source segments --
// so a linear scan is quadratic. Each segment is bucketed into every cell its bbox
// (padded by tol) covers, so a point within tol of a segment always shares a cell
// with it and a query need only scan its own cell. Cell size targets ~1 segment
// per cell. This is a flat hash keyed by integer cell, not a general index.
function buildSegmentGrid(segs, tol) {
  var n = segs.length, i, s;
  var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (i = 0; i < n; i++) {
    s = segs[i];
    if (s[0] < minx) minx = s[0]; if (s[2] < minx) minx = s[2];
    if (s[0] > maxx) maxx = s[0]; if (s[2] > maxx) maxx = s[2];
    if (s[1] < miny) miny = s[1]; if (s[3] < miny) miny = s[3];
    if (s[1] > maxy) maxy = s[1]; if (s[3] > maxy) maxy = s[3];
  }
  var pad = tol > 0 ? tol : 0;
  var diag = Math.sqrt((maxx - minx) * (maxx - minx) + (maxy - miny) * (maxy - miny));
  // keep cells >= 2*tol so a within-tol segment falls in the query's own cell
  var cell = Math.max(diag / (Math.sqrt(n) || 1) || 1, pad * 2 || 1);
  var map = new Map();
  for (i = 0; i < n; i++) {
    s = segs[i];
    var cx0 = Math.floor((Math.min(s[0], s[2]) - pad - minx) / cell);
    var cx1 = Math.floor((Math.max(s[0], s[2]) + pad - minx) / cell);
    var cy0 = Math.floor((Math.min(s[1], s[3]) - pad - miny) / cell);
    var cy1 = Math.floor((Math.max(s[1], s[3]) + pad - miny) / cell);
    for (var cx = cx0; cx <= cx1; cx++) {
      for (var cy = cy0; cy <= cy1; cy++) {
        var key = cx + ',' + cy, bucket = map.get(key);
        if (bucket) bucket.push(i); else map.set(key, [i]);
      }
    }
  }
  return {segs: segs, map: map, cell: cell, minx: minx, miny: miny};
}

// True if (px,py) is within `tol` of any segment in the grid. Only the query
// point's own cell is scanned (see buildSegmentGrid for why that is sufficient).
function segmentGridWithin(grid, px, py, tol) {
  var cx = Math.floor((px - grid.minx) / grid.cell);
  var cy = Math.floor((py - grid.miny) / grid.cell);
  var bucket = grid.map.get(cx + ',' + cy);
  if (!bucket) return false;
  var t2 = tol * tol, segs = grid.segs;
  for (var i = 0; i < bucket.length; i++) {
    var s = segs[bucket[i]];
    if (pointSegDistSq2(px, py, s[0], s[1], s[2], s[3]) <= t2) return true;
  }
  return false;
}

// Part id (segment[4]) of the nearest segment within `tol` of (px,py), or -1.
// Segments must carry a part id (see collectSourceParts); used to tell which
// source landmass a fill edge hugs so an island bridge can be recognized.
function segmentGridPart(grid, px, py, tol) {
  var cx = Math.floor((px - grid.minx) / grid.cell);
  var cy = Math.floor((py - grid.miny) / grid.cell);
  var bucket = grid.map.get(cx + ',' + cy);
  if (!bucket) return -1;
  var best = -1, bestD = tol * tol, segs = grid.segs;
  for (var i = 0; i < bucket.length; i++) {
    var s = segs[bucket[i]];
    var d = pointSegDistSq2(px, py, s[0], s[1], s[2], s[3]);
    if (d <= bestD) { bestD = d; best = s[4]; }
  }
  return best;
}

// Flatten polygon shapes to boundary segments [ax, ay, bx, by, partId] and the
// net true area of each part (outer ring minus holes), indexed by partId. A
// "part" is one polygon of a (multi)polygon; each is a distinct landmass, so its
// area is how the island test decides whether a bridged component is small. Areas
// are computed in real units (spherical m^2 for lat-long, else planar coordinate
// units) so the mouth-disk comparison is latitude-independent.
function collectSourceParts(shapes, arcs, spherical) {
  var segs = [], areas = [], pid = 0;
  (shapes || []).forEach(function(shp) {
    if (!shp) return;
    getPolygonMultiPolygonCoords(shp, arcs).forEach(function(rings) {
      var net = 0;
      rings.forEach(function(ring, ri) {
        var a = Math.abs(ringTrueArea(ring, spherical));
        net += ri === 0 ? a : -a;
        for (var i = 1; i < ring.length; i++) {
          segs.push([ring[i - 1][0], ring[i - 1][1], ring[i][0], ring[i][1], pid]);
        }
      });
      areas[pid] = net;
      pid++;
    });
  });
  return {segs: segs, areas: areas};
}

// Signed area of a closed ring of [x,y] points -- spherical (m^2, [lng,lat]) or
// planar shoelace -- matching the coordinate-geometry area functions.
function ringTrueArea(ring, spherical) {
  if (spherical) return getSphericalPathArea2(pointsIter(ring));
  return getPlanarPathArea2(ring);
}

// Minimal forward iterator over an array of [x,y] points, for the *PathArea2
// helpers that expect a mapshaper shape iterator.
function pointsIter(points) {
  var i = -1;
  return {
    x: 0, y: 0,
    hasNext: function() {
      if (++i >= points.length) return false;
      this.x = points[i][0];
      this.y = points[i][1];
      return true;
    }
  };
}

// Measure how much of a bridged fill's coastline hugs a small landmass. Returns
// {count, smallFrac}: count is the number of distinct source parts the fill
// touches, smallFrac the fraction of its coast length that runs along a part
// smaller than islandMaxArea (a mouth-radius disk). An island bridge -- a small
// isolated landmass joined to a neighbor across a narrow channel -- has a large
// smallFrac because the island forms much of the fill's shore. A deep river that
// merely grazes a small mid-channel island has a tiny smallFrac, so it is not
// mistaken for one. Bridge (open-water) edges are ignored; they carry no part.
function islandBridgeMetrics(ring, srcGrid, areas, tol, islandMaxArea) {
  var n = ring.length - 1, seen = {}, count = 0, coastLen = 0, smallLen = 0;
  for (var i = 0; i < n; i++) {
    var mx = (ring[i][0] + ring[i + 1][0]) / 2, my = (ring[i][1] + ring[i + 1][1]) / 2;
    var pid = segmentGridPart(srcGrid, mx, my, tol);
    if (pid < 0) continue;
    var len = ptDist(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
    coastLen += len;
    if (areas[pid] < islandMaxArea) smallLen += len;
    if (!seen[pid]) { seen[pid] = true; count++; }
  }
  return {count: count, smallFrac: coastLen > 0 ? smallLen / coastLen : 0};
}

// True when a bridged fill joins two or more distinct source landmasses and
// bridges a small one (below a mouth-radius disk) -- an island the buffer would
// swallow into its neighbor. Smallness is absolute rather than relative to the
// neighbor, so a small landmass abutting a large one is recognized as an island
// while two large adjacent polygons (e.g. states sharing a river) are not. Two
// signatures qualify (see the constants above): a cluster whose shore is mostly
// small islands, or a compact strait joining a small island to a neighbor. A
// deep/winding river that grazes a small mid-channel island matches neither
// (elongated, and lined mostly by the mainland), so it keeps filling.
function bridgesSmallIsland(ring, srcGrid, areas, tol, islandMaxArea) {
  var m = islandBridgeMetrics(ring, srcGrid, areas, tol, islandMaxArea);
  if (m.count < 2) return false;
  if (m.smallFrac >= ISLAND_DOMINANT_COAST_FRAC) return true; // islands are a big share of the shore
  if (m.smallFrac < ISLAND_MIN_COAST_FRAC) return false;      // incidental graze
  var im = inletMetrics(ring, srcGrid, tol);                  // else: compact strait?
  return !!im && im.arc / im.mouth < ISLAND_MAX_ARC_RATIO;
}

// Dissolve every feature of a buffered dataset into a single union polygon (the
// morphological dilation). The per-feature dilation tiles the union exactly, so
// merging all rings into one shape and boundary-dissolving yields the union
// outline (with any wide enclosed holes preserved). Returns null if empty.
function unionBufferDataset(dataset, opts) {
  var lyr = dataset.layers[0];
  if (!lyr || !dataset.arcs) return null;
  var coords = [];
  (lyr.shapes || []).forEach(function(shp) {
    if (shp) coords = coords.concat(getPolygonMultiPolygonCoords(shp, dataset.arcs));
  });
  if (coords.length === 0) return null;
  var unionDataset = getBufferDataset(coords);
  if (!unionDataset.arcs) return null;
  dissolveBufferDataset2(unionDataset, Object.assign({}, opts, {winding_fill: false}));
  return unionDataset;
}

// Raw (undissolved) offset rings for the polygon buffer's debug-offset view.
// Drives the same per-ring makers the real construction uses, so the view shows
// exactly what is built and 'no-loop-removal' has a visible effect (loop removal
// runs inside the maker -- see buildOneSidedRings). Positive grow uses the
// clean-outline maker by default (the band maker under band-method); holes are
// eroded with the band maker reversed to outer orientation (matching
// makeOutlineBufferGeometry); negative (erode) buffers offset every ring inward
// with the band maker.
function makePolygonDebugOffsetGeoJSON(lyr, dataset, opts) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var useOutline = !opts.band_method;
  var leftOpts = useOutline ? Object.assign({}, opts, {outline: true}) : opts;
  var leftMaker = getPolygonRingBufferMaker(dataset, leftOpts, 'left', true);
  var rightMaker = getPolygonRingBufferMaker(dataset,
    Object.assign({}, opts, {outline: false}), 'right', true);
  var geometries = lyr.shapes.map(function(shape, i) {
    var distance = distanceFn(i);
    if (!distance || !shape) return null;
    var coords;
    if (distance > 0) {
      var rings = splitShapeRingsByArea(shape, dataset.arcs);
      coords = getBufferMultiPolygonCoords(rings.outer, distance, leftMaker);
      if (rings.holes.length > 0) {
        coords = coords.concat(getBufferMultiPolygonCoords(
          rings.holes.map(reversePath), distance, rightMaker));
      }
    } else {
      coords = getBufferMultiPolygonCoords(shape, -distance, rightMaker);
    }
    return coords.length > 0 ? {type: 'MultiPolygon', coordinates: coords} : null;
  });
  return {type: 'GeometryCollection', geometries: geometries};
}

// Clean-outline polygon buffer (the default polygon-grow construction): offset
// each source ring to a single self-contained closed loop (no source-path band
// edge), strip self-overlaps with the crossing-direction loop remover (safe
// because a single offset loop has a consistent +/-1 base winding), then union
// the loops by winding number. The loops carry far fewer rings and self-
// intersections into the dissolve than the band-ribbon construction, and the
// direction remover collapses more overshoot loops than the source-turn gate.
//
// Used for the positive (grow) buffer. The outer source rings are offset
// outward with the fast clean-outline construction (a single self-contained loop
// per ring, crossing-direction loop removal, winding union) -- this is where the
// method pays off, since a large coastline's outer boundary dominates the
// dissolve cost. Holes shrink, which is an INWARD offset; an inward outline
// offset is fragile (its elbow insets self-cross on concave holes and invert on
// over-shrink, and mapshaper's winding flood can't tell a collapsed contour from
// a valid one because it normalizes orientation), so holes are shrunk with the
// proven band-ribbon erode and then carved out of the grown outer (see
// makeOutlineBufferGeometry). Negative (erode) buffers fall back to the band
// construction entirely.
function makeOutlinePolygonBufferGeoJSON(lyr, dataset, opts) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var hasPositiveDistance = false;
  var hasNegativeDistance = false;
  // Force the clean-outline construction on the outer maker (this is the
  // default polygon-grow path, so it must not depend on a command-line flag).
  var outlineOpts = Object.assign({}, opts, {outline: true});
  var outerMaker = getPolygonRingBufferMaker(dataset, outlineOpts, 'left', true);
  // Band maker for negative buffers and for shrinking holes.
  var bandOpts = Object.assign({}, opts, {outline: false});
  var bandRightMaker = getPolygonRingBufferMaker(dataset, bandOpts, 'right', true);
  // Left winding-fill maker for the nested-fill fallback (see below).
  var bandLeftMaker = getPolygonRingBufferMaker(dataset, bandOpts, 'left', true);
  var holeEroder = function(holeShape, dist) {
    return makeNegativePolygonBufferGeometry(holeShape, dist, dataset, bandOpts,
      bandRightMaker);
  };
  var geometries = lyr.shapes.map(function(shape, i) {
    var distance = distanceFn(i);
    if (!distance || !shape) return null;
    if (distance < 0) {
      hasNegativeDistance = true;
      return makeNegativePolygonBufferGeometry(shape, -distance, dataset,
        bandOpts, bandRightMaker);
    }
    hasPositiveDistance = true;
    var geom;
    if (shapeHasFillInsideHole(shape, dataset.arcs)) {
      // The clean-outline construction grows ALL of a shape's outer rings into
      // one solid fill before carving holes (makeOutlineBufferGeometry), which
      // absorbs a fill nested inside a hole: the nested fill's offset loop just
      // adds winding to the surrounding solid, and the later hole carve removes
      // the region where it lived. The winding-fill construction instead groups
      // rings by containment and buffers each group independently, so the nested
      // fill is grown on its own and survives. It is slower, so use it only for
      // the rare shapes that actually nest a fill inside a hole.
      geom = makePositivePolygonBufferGeometry(shape, distance, dataset, opts,
        bandLeftMaker);
    } else {
      geom = makeOutlineBufferGeometry(shape, dataset.arcs, distance, opts,
        outerMaker, holeEroder);
    }
    if (opts.polar && shapeReachesPole(shape, dataset.arcs)) {
      // A pole-touching ring collapses onto the pole line during Mercator
      // offset construction, so the outline keeps only the coastline; append
      // the source rings and let the dataset-level dissolve union them into the
      // full grown shape (same handling as the band construction).
      geom = appendSourceRings(geom, shape, dataset.arcs);
    }
    return geom;
  });
  return {
    geojson: {
      type: 'GeometryCollection',
      geometries: geometries
    },
    dissolveAfterSplit: hasPositiveDistance && !hasNegativeDistance
  };
}

// True if the shape has a fill (positive-area ring) nested directly inside a
// hole (negative-area ring) -- e.g. an island sitting in a lake. The clean-
// outline grow can't represent such a fill (it grows all outer rings into one
// solid before carving holes, absorbing the nested fill), so callers route
// these shapes to the winding-fill construction instead.
function shapeHasFillInsideHole(shape, arcs) {
  var paths = exportPathData(shape, arcs, 'polygon').pathData;
  var fills = 0, holes = 0;
  paths.forEach(function(p) {
    if (p.area > 0) fills++;
    else if (p.area < 0) holes++;
  });
  // Nesting a fill inside a hole needs at least two fills (a container and the
  // nested one) and at least one hole; bail cheaply otherwise (the common case)
  // before building the spatial index.
  if (fills < 2 || holes < 1) return false;
  var ringShapes = paths.map(function(p) { return [p.ids]; });
  var index = new PathIndex(ringShapes, arcs);
  return paths.some(function(p) {
    if (p.area <= 0) return false; // only fills can be nested inside a hole
    var containerId = index.findSmallestEnclosingPolygon(p.ids);
    return containerId > -1 && paths[containerId].area < 0;
  });
}

// Split a shape's rings into outer rings (positive signed area) and hole rings
// (negative signed area), keeping each ring's arc ids.
function splitShapeRingsByArea(shape, arcs) {
  var outer = [];
  var holes = [];
  exportPathData(shape, arcs, 'polygon').pathData.forEach(function(path) {
    (path.area < 0 ? holes : outer).push(path.ids.concat());
  });
  return {outer: outer, holes: holes};
}

function makeOutlineBufferGeometry(shape, arcs, distance, opts, outerMaker,
    holeEroder) {
  var rings = splitShapeRingsByArea(shape, arcs);
  var outerLoops = rings.outer.length > 0 ?
    getBufferMultiPolygonCoords(rings.outer, distance, outerMaker) : [];
  if (outerLoops.length === 0) return null;
  // Resolve the outer offset loops' self-overlaps into clean grown polygons.
  var coords = dissolveOffsetRingsToCoords(outerLoops, opts, true);
  if (coords.length === 0) return null;
  if (rings.holes.length > 0) {
    // Shrink the holes (an inward offset) with the band erode: treat each hole
    // as a polygon to erode by reversing it to outer (CCW) orientation, then
    // carve the eroded regions out of the grown outer.
    var holeShape = rings.holes.map(reversePath);
    var holeGeom = holeEroder(holeShape, distance);
    if (holeGeom && holeGeom.coordinates.length > 0) {
      coords = subtractHolesFromOuter(coords, holeGeom.coordinates);
    }
  }
  if (coords.length === 0) return null;
  return {type: 'MultiPolygon', coordinates: coords};
}

// Clean-outline grow for one topological feature: offset each shared-arc path
// chain (see getPolygonBufferPathData), grow outers with the outline maker,
// shrink holes with the band erode, then union -- same hole semantics as
// makeOutlineBufferGeometry but with inter-feature path splitting preserved.
//
// A chain is classified as outer (grow) vs hole (shrink) by the signed area of
// the CLOSED SOURCE RING it was split from, not by the chain's own area: an
// unshared-boundary chain is an OPEN fragment (e.g. a state's international or
// coastline segment between two shared interior borders), whose planar signed
// area has an arbitrary sign and would misclassify a real outer boundary as a
// hole -- eroding it inward instead of growing it (Ohio's Lake Erie coast, New
// Mexico's Mexico border).
function makeTopologicalOutlineBufferCoords(shape, arcs, distance, uniqueArcTest,
    opts, outerMaker, holeEroder) {
  var outer = [];
  var holes = [];
  (shape || []).forEach(function(ring) {
    var target = getPlanarPathArea(ring, arcs) < 0 ? holes : outer;
    var chains = uniqueArcTest ? splitPathAtSharedArcs(ring, uniqueArcTest) :
      [ring.concat()];
    chains.forEach(function(chain) { target.push(chain); });
  });
  var outerLoops = outer.length > 0 ?
    getBufferMultiPolygonCoords(outer, distance, outerMaker) : [];
  if (outerLoops.length === 0) return [];
  var coords = dissolveOffsetRingsToCoords(outerLoops, opts, true);
  if (coords.length === 0) return [];
  if (holes.length > 0) {
    var holeGeom = holeEroder(holes.map(reversePath), distance);
    if (holeGeom && holeGeom.coordinates.length > 0) {
      coords = subtractHolesFromOuter(coords, holeGeom.coordinates);
    }
  }
  return coords;
}

// Carve clean shrunk-hole regions out of clean grown-outer polygons. Both arrive
// as positive (CCW) rings. The winding union can't subtract one nested loop from
// another -- GeoJSON import rewinds every outer ring to CCW, so two separately
// imported nested loops both read as fill -- so instead we make each hole a
// negative-area inner ring of the same shape: reverse the hole rings at the arc
// level (reversing GeoJSON coordinates wouldn't survive import's rewind) and let
// groupPolygonRings (which classifies a ring as a hole by negative area) nest
// each hole into its containing outer. The outer and hole rings are disjoint
// (holes lie strictly inside outers), so no intersection cuts are needed.
function subtractHolesFromOuter(outerCoords, holeCoords) {
  if (!holeCoords || holeCoords.length === 0) return outerCoords;
  var dataset = importGeoJSON({
    type: 'GeometryCollection',
    geometries: [
      {type: 'MultiPolygon', coordinates: outerCoords},
      {type: 'MultiPolygon', coordinates: holeCoords}
    ]
  }, {type: 'polygon'});
  if (!dataset.arcs) return outerCoords;
  var shapes = dataset.layers[0].shapes;
  var outerShape = shapes[0] || [];
  var holeShape = shapes[1] || [];
  var merged = outerShape.concat(holeShape.map(reversePath));
  return getPolygonMultiPolygonCoords(merged, dataset.arcs);
}

// World rectangle (lng/lat) the polar buffer is clipped to.
var POLAR_WORLD_BBOX = [-180, -90, 180, 90];
var POLAR_BUFFER_MARGIN_DEGREES = 1e-4;

function polygonBufferNeedsPolarMode(lyr, dataset, opts) {
  if (!dataset.arcs) return false;
  var bounds = dataset.arcs.getBounds();
  var maxAbsLat = Math.max(Math.abs(bounds.ymin), Math.abs(bounds.ymax));
  var maxPositiveDistance = getMaxPositiveBufferDistance(lyr, dataset, opts);
  if (!(maxPositiveDistance > 0)) return false;
  return maxAbsLat + maxPositiveDistance / R * R2D >= 90 - POLAR_BUFFER_MARGIN_DEGREES;
}

function getMaxPositiveBufferDistance(lyr, dataset, opts) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var max = 0, hasNegative = false;
  (lyr.shapes || []).forEach(function(shape, i) {
    if (!shape) return;
    var distance = distanceFn(i);
    if (distance < 0) hasNegative = true;
    if (distance > max) max = distance;
  });
  // Don't auto-enable polar mode for mixed or negative erode buffers: the polar
  // construction keeps pole seams pinned and currently supports grow buffers only.
  return hasNegative ? 0 : max;
}

// True for a positive (grow) buffer whose source has a ring that wraps the full
// longitude range (e.g. a band circling the globe). Such a ring is closed in
// unwrapped Mercator (net winding 0, unlike a pole-encircling ring) but its
// world-wide straight edges collapse in the default construction, so it needs
// the seam-pinning polar path.
function polygonBufferWrapsAntimeridian(lyr, dataset, opts) {
  if (!(getMaxPositiveBufferDistance(lyr, dataset, opts) > 0)) return false;
  return sourceHasFullLongitudeRing(lyr, dataset);
}

// Minimum unwrapped longitude span (of 360) for a ring to count as wrapping the
// full globe.
var FULL_LONGITUDE_MIN_SPAN = 350;

// Raw (not unwrapped) longitude delta, in degrees, above which an edge is treated
// as a full-turn "sweep" edge (endpoints on opposite antimeridian reps, e.g.
// -180 -> 180). A genuine antimeridian crossing has a much smaller raw delta.
var SWEEP_EDGE_MIN_RAW_DELTA = 359;
// A vertex within this many degrees of +/-90 counts as sitting on a pole.
var POLE_LATITUDE_EPS = 1e-3;
// A ring is pole-encircling (handled by normalization, not a collapsing band)
// when |net longitude winding| is near 360; treat anything below this as a band.
var NON_ENCIRCLING_WINDING_MAX = 180;

// True if a ring has a full-longitude "sweep" edge that will collapse when
// buffered: an edge whose raw longitude delta is ~360 and that does NOT sit on a
// pole (a sweep edge along a pole line is a single point, so it is harmless).
export function ringHasCollapsingSweepEdge(ring) {
  if (!ring) return false;
  for (var i = 1; i < ring.length; i++) {
    var a = ring[i - 1], b = ring[i];
    if (Math.abs(b[0] - a[0]) < SWEEP_EDGE_MIN_RAW_DELTA) continue;
    if (Math.abs(a[1]) < 90 - POLE_LATITUDE_EPS ||
        Math.abs(b[1]) < 90 - POLE_LATITUDE_EPS) {
      return true;
    }
  }
  return false;
}

// True if the source has a ring that will collapse when buffered because a
// full-longitude edge has no intermediate vertices. Excludes pole-encircling
// rings (|net winding| ~ 360), which are normalized and buffer correctly, and
// sweep edges that lie on a pole line (harmless). Cheap O(1) gates first: the
// dataset must reach both antimeridian extremes; only full-width shapes are
// exported and scanned.
function sourceHasCollapsingBandEdge(lyr, dataset) {
  if (!dataset.arcs) return false;
  var b = dataset.arcs.getBounds();
  if (b.xmin > -180 + 1e-6 || b.xmax < 180 - 1e-6) return false;
  return (lyr.shapes || []).some(function(shape) {
    if (!shape) return false;
    var sb = dataset.arcs.getMultiShapeBounds(shape);
    if (!sb || (sb.xmax - sb.xmin) < FULL_LONGITUDE_MIN_SPAN) return false;
    return getPolygonMultiPolygonCoords(shape, dataset.arcs).some(function(rings) {
      return rings.some(function(ring) {
        return Math.abs(ringLngWinding(ring)) < NON_ENCIRCLING_WINDING_MAX &&
          ringHasCollapsingSweepEdge(ring);
      });
    });
  });
}

// True if any source ring spans (nearly) the full longitude range once its
// longitudes are unwrapped across the antimeridian. Uses the same cheap gates as
// sourceHasPoleEnclosingRing (dataset reaches the antimeridian; only wide shapes
// are exported and scanned). A small polygon that merely crosses the antimeridian
// unwraps to a narrow span and is correctly excluded.
function sourceHasFullLongitudeRing(lyr, dataset) {
  if (!dataset.arcs) return false;
  var b = dataset.arcs.getBounds();
  if (b.xmin > -180 + 1e-6 && b.xmax < 180 - 1e-6) return false;
  return (lyr.shapes || []).some(function(shape) {
    if (!shape) return false;
    var sb = dataset.arcs.getMultiShapeBounds(shape);
    if (!sb || (sb.xmax - sb.xmin) < FULL_LONGITUDE_MIN_SPAN) return false;
    return getPolygonMultiPolygonCoords(shape, dataset.arcs).some(function(rings) {
      return rings.some(function(ring) {
        return ringUnwrappedLngSpan(ring) >= FULL_LONGITUDE_MIN_SPAN;
      });
    });
  });
}

// Longitude extent of a ring after unwrapping across the antimeridian (each edge's
// longitude delta reduced to (-180, 180], accumulated). A globe-wrapping ring
// spans ~360; a small antimeridian-crossing polygon spans only its true width.
function ringUnwrappedLngSpan(ring) {
  if (!ring || ring.length < 2) return 0;
  var x = 0, min = 0, max = 0;
  for (var i = 1; i < ring.length; i++) {
    var d = ring[i][0] - ring[i - 1][0];
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    x += d;
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return max - min;
}

// A ring is at least this many degrees wide (full longitude range is 360) to be
// considered a possible pole-encircling ring; skips the coordinate export and
// winding scan for ordinary shapes.
var POLE_ENCLOSING_MIN_WIDTH = 350;
// A ring encircles a pole when its longitudes wind a full turn; accept a wide
// band around 360 so a jagged coastline that overshoots/undershoots still counts.
var POLE_WINDING_TOLERANCE = 90;

// True if any source ring encircles a pole (spans the full longitude range and
// its longitudes wind a full turn). Cheap O(1) guards first: the dataset must
// reach the antimeridian, and only shapes spanning nearly the whole longitude
// range are exported to coordinates and winding-tested.
function sourceHasPoleEnclosingRing(lyr, dataset) {
  if (!dataset.arcs) return false;
  var b = dataset.arcs.getBounds();
  if (b.xmin > -180 + 1e-6 && b.xmax < 180 - 1e-6) return false;
  return (lyr.shapes || []).some(function(shape) {
    if (!shape) return false;
    var sb = dataset.arcs.getMultiShapeBounds(shape);
    if (!sb || (sb.xmax - sb.xmin) < POLE_ENCLOSING_MIN_WIDTH) return false;
    return getPolygonMultiPolygonCoords(shape, dataset.arcs).some(function(rings) {
      return rings.some(function(ring) { return ringEnclosedPole(ring) !== 0; });
    });
  });
}

// Net signed longitude winding of a lng/lat ring (sum of per-edge longitude
// deltas, each unwrapped to (-180, 180]). A ring that encircles a pole winds
// +/-360; an ordinary ring (including one that merely straddles the antimeridian)
// winds 0.
function ringLngWinding(ring) {
  var net = 0;
  for (var i = 1; i < ring.length; i++) {
    var d = ring[i][0] - ring[i - 1][0];
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    net += d;
  }
  return net;
}

// Returns the pole latitude (+90 or -90) a ring encircles, or 0 if it does not.
// The enclosed pole is the one in the ring's hemisphere: a pole-hugging coastline
// lies entirely to one side of the equator, so the mean vertex latitude picks the
// correct pole (and is robust to the ambiguous which-pole guess in
// removePolygonCrosses).
function ringEnclosedPole(ring) {
  if (!ring || ring.length < 4) return 0;
  if (Math.abs(Math.abs(ringLngWinding(ring)) - 360) > POLE_WINDING_TOLERANCE) return 0;
  var sum = 0;
  for (var i = 0; i < ring.length; i++) sum += ring[i][1];
  return sum / ring.length < 0 ? -90 : 90;
}

// Close a pole-encircling ring by walking a floor along the enclosed pole line
// from the ring's antimeridian exit meridian back to its entry meridian, turning
// it into an ordinary closed polygon (the pole-touching-shell representation).
// Handles the common single-antimeridian-crossing case; returns null otherwise so
// the caller leaves the ring unchanged.
function closeRingThroughPole(ring, poleLat) {
  if (countCrosses(ring) === 0) return null;
  var parts = splitPathAtAntimeridian(ring);
  if (parts.length !== 1) return null; // only the single-crossing case
  var part = parts[0];
  var startX = part[0][0];
  var endX = part[part.length - 1][0];
  if (Math.abs(startX) !== 180 || Math.abs(endX) !== 180 || startX === endX) {
    return null;
  }
  var out = part.map(function(p) { return p.concat(); });
  poleLineVertices(endX, startX, poleLat).forEach(function(p) { out.push(p); });
  out.push(part[0].concat()); // close the ring
  return out;
}

// Vertices tracing the pole line from fromX to toX (both +/-180) at poleLat, with
// an intermediate point at least every 45 degrees so no segment spans more than a
// quarter turn (long near-pole segments confuse the Mercator offset joins).
function poleLineVertices(fromX, toX, poleLat) {
  var step = fromX > toX ? -45 : 45;
  var pts = [[fromX, poleLat]];
  var x = fromX;
  while (Math.abs(x - toX) > 45 + 1e-9) {
    x += step;
    pts.push([x, poleLat]);
  }
  pts.push([toX, poleLat]);
  return pts;
}

// Rebuild the target layer with pole floors inserted into pole-encircling rings,
// so the buffer's polar path can grow them. Preserves shape order/count (so the
// per-shape distance function and data table stay aligned) and the source CRS.
// Returns {layer, dataset} or null if no ring was actually normalized.
function buildPoleEnclosingNormalizedSource(lyr, dataset) {
  var changed = false;
  var features = (lyr.shapes || []).map(function(shape) {
    var geom = null;
    if (shape) {
      var polys = getPolygonMultiPolygonCoords(shape, dataset.arcs).map(function(rings) {
        return rings.map(function(ring) {
          var poleLat = ringEnclosedPole(ring);
          if (!poleLat) return ring;
          var closed = closeRingThroughPole(ring, poleLat);
          if (closed) { changed = true; return closed; }
          return ring;
        });
      });
      if (polys.length > 0) geom = {type: 'MultiPolygon', coordinates: polys};
    }
    return {type: 'Feature', properties: null, geometry: geom};
  });
  if (!changed) return null;
  var normDataset = importGeoJSON({type: 'FeatureCollection', features: features},
    {type: 'polygon'});
  if (!normDataset.arcs) return null;
  normDataset.info = Object.assign({}, dataset.info);
  var normLyr = normDataset.layers[0];
  normLyr.name = lyr.name;
  if (lyr.data) normLyr.data = lyr.data.clone();
  return {layer: normLyr, dataset: normDataset};
}

// Buffer a polygon sliced at the antimeridian (lng +/-180) and/or a pole
// (lat +/-90): build the offset (the pole-touching source rings are added back,
// see makePolygonBufferGeoJSON), dissolve, and constrain the result to the world
// rectangle. The overshoot past the antimeridian is handled one of two ways,
// depending on the source:
//
//  - A pole-abutting shape that does NOT span the antimeridian (e.g. a cap slice
//    reaching the pole from a limited range of longitudes) genuinely wraps when
//    grown: a fixed ground distance spans an unbounded longitude range as
//    latitude approaches +/-90, so the offset ring's near-pole corners swing all
//    the way across the antimeridian. That wrapped part is real coverage, so it
//    is folded back into [-180,180] by an antimeridian split; a plain world-rect
//    clip would discard it and drop the whole shape.
//
//  - A shape whose source already sits on the antimeridian seam (an
//    Antarctica-style shell spanning +/-180) only spills a thin band past the
//    seam, and that band is redundant -- the shell already covers those
//    longitudes -- so it is clipped off to keep the seam pinned to the extent.
//    Wrapping such a full-width ring instead mangles it (the near-global ring
//    reads as an antimeridian crossing and gets cut apart), so the split is
//    skipped for these.
//
// Only positive (grow) distances are supported. A negative (erode) buffer would
// have to keep the artificial seam edges pinned to the extent while only the
// coastline moves inward; the winding-fill construction can't do that without
// producing self-intersecting geometry (the pinned seam coincides with the
// source boundary, which the dissolve cannot resolve), so we reject it with a
// clear message rather than emit a result whose seams have crept inward.
function makePolarPolygonBuffer(lyr, dataset, opts) {
  if (polarBufferHasNegativeDistance(lyr, dataset, opts)) {
    stop('The polar option does not support negative (erode) buffers yet.');
  }
  var output = buildPolygonBufferOutput(lyr, dataset, opts);
  var dataset2 = importGeoJSON(output.geojson, {type: 'polygon'});
  if (dataset2.arcs) {
    if (output.dissolveAfterSplit) {
      dissolveBufferDataset2(dataset2, opts);
    }
    if (!sourceReachesAntimeridian(dataset)) {
      splitAntimeridianBufferDataset(dataset2);
    }
    clipDatasetToWorldRect(dataset2);
  }
  return dataset2;
}

// True if the source geometry reaches the antimeridian (lng +/-180), i.e. it is
// an antimeridian-sliced shell whose seam edges the polar buffer should pin to
// the extent rather than wrap (see makePolarPolygonBuffer).
function sourceReachesAntimeridian(dataset) {
  if (!dataset.arcs) return false;
  var b = dataset.arcs.getBounds();
  return b.xmin <= -180 + 1e-3 || b.xmax >= 180 - 1e-3;
}

function polarBufferHasNegativeDistance(lyr, dataset, opts) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  return (lyr.shapes || []).some(function(shape, i) {
    return shape && distanceFn(i) < 0;
  });
}

function clipDatasetToWorldRect(dataset) {
  if (!dataset.arcs || !dataset.layers.length) return;
  dataset.layers = clipLayersByBBox(dataset.layers, dataset,
    {bbox2: POLAR_WORLD_BBOX, no_cleanup: true});
}

function makePolygonBufferGeoJSON(lyr, dataset, opts) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var useTopologicalMode = !!opts.topological;
  var uniqueArcTest = useTopologicalMode ? getUniqueArcTest(lyr, dataset.arcs) : null;
  var hasPositiveDistance = false;
  var hasNegativeDistance = false;
  if (useTopologicalMode) {
    // The topological pipeline selects mosaic tiles by source membership
    // (boundary flood), which cannot resolve self-overlapping offset rings.
    // Each feature's offset is pre-dissolved into a clean polygon before it
    // enters the shared mosaic. By default this uses the same clean-outline grow
    // as ordinary polygon buffers (gap-patch, loop removal); band-method keeps
    // the older band ribbon.
    var topoLeftOpts = opts.band_method ? opts :
      Object.assign({}, opts, {outline: true});
    var outerMaker = getPolygonRingBufferMaker(dataset, topoLeftOpts, 'left', true);
    var bandOpts = Object.assign({}, opts, {outline: false});
    var bandLeftMaker = getPolygonRingBufferMaker(dataset, bandOpts, 'left', true);
    var bandRightMaker = getPolygonRingBufferMaker(dataset, bandOpts, 'right', true);
    var holeEroder = function(holeShape, dist) {
      return makeNegativePolygonBufferGeometry(holeShape, dist, dataset, bandOpts,
        bandRightMaker);
    };
    return makeTopologicalPolygonBufferGeoJSON(lyr, dataset, opts, distanceFn,
      uniqueArcTest, outerMaker, holeEroder, bandLeftMaker);
  }
  // Closed source rings are offset with the winding-fill construction: one
  // self-overlapping ring per source ring (its overshoot loops resolved by the
  // winding-number dissolve in makeClosedRingBufferGeometry) instead of many
  // overlapping per-segment section bands. The single ring carries far fewer
  // rings and self-intersections into the dissolve, which dominates polygon-
  // buffer runtime.
  var leftBufferMaker = getPolygonRingBufferMaker(dataset, opts, 'left', true);
  var rightBufferMaker = getPolygonRingBufferMaker(dataset, opts, 'right', true);
  var geometries = lyr.shapes.map(function(shape, i) {
    var distance = distanceFn(i);
    if (!distance || !shape) return null;
    if (distance < 0) {
      hasNegativeDistance = true;
      return makeNegativePolygonBufferGeometry(shape, -distance, dataset, opts,
        rightBufferMaker);
    }
    hasPositiveDistance = true;
    var geom = makePositivePolygonBufferGeometry(shape, distance, dataset, opts,
      leftBufferMaker);
    if (opts.polar && shapeReachesPole(shape, dataset.arcs)) {
      // A pole-touching ring collapses onto the pole line (Mercator can't reach
      // the pole) and the ring-filtering drops it, so the winding fill keeps only
      // the coastline band. Append the source rings; the dataset-level dissolve
      // unions them with the band into the full grown shape. (Shapes that don't
      // reach a pole -- e.g. the complement ocean in the negative path -- fill
      // correctly on their own, and the appended source would tangle them.)
      geom = appendSourceRings(geom, shape, dataset.arcs);
    }
    return geom;
  });
  return {
    geojson: {
      type: 'GeometryCollection',
      geometries: geometries
    },
    dissolveAfterSplit: hasPositiveDistance && !hasNegativeDistance
  };
}

// True if any vertex of the shape sits at a pole (lat +/-90). Such a ring gets
// pinched onto the pole line during Mercator offset construction.
function shapeReachesPole(shape, arcs) {
  var b = arcs.getMultiShapeBounds(shape);
  return b.ymax >= 90 - 1e-3 || b.ymin <= -90 + 1e-3;
}

// Combine a buffer geometry with the source polygon's rings into one
// MultiPolygon (overlapping); a later union dissolve merges them. Used by the
// polar option to keep the polar interior that the pole-pinched ribbon drops.
//
// Only the source parts that actually reach a pole are appended. A multipolygon
// feature can mix a pole-touching part with mid-latitude parts (e.g. a lake-
// holed rectangle far from the pole in the same feature); those mid-latitude
// parts buffer correctly on their own, and re-injecting their source rings would
// override the eroded holes the offset construction already produced (the source
// holes come in at full, un-eroded size and win the union), leaving the holes
// unbuffered.
function appendSourceRings(geom, shape, arcs) {
  var sourceCoords = getPolygonMultiPolygonCoords(shape, arcs)
    .filter(polyReachesPole);
  var coords = [];
  if (geom && geom.type == 'MultiPolygon') coords = coords.concat(geom.coordinates);
  else if (geom && geom.type == 'Polygon') coords.push(geom.coordinates);
  coords = coords.concat(sourceCoords);
  if (coords.length === 0) return null;
  return {type: 'MultiPolygon', coordinates: coords};
}

// True if any vertex of a MultiPolygon part (an array of [x,y] rings) sits at a
// pole (lat +/-90).
function polyReachesPole(poly) {
  return poly.some(function(ring) {
    return ring.some(function(p) {
      return p[1] >= 90 - 1e-3 || p[1] <= -90 + 1e-3;
    });
  });
}

function getPolygonRingBufferMaker(dataset, opts, side, winding) {
  // The band-method escape hatch forces the older non-winding construction even
  // for callers that request winding-fill (see the 'band-method' option).
  var useWinding = !!winding && !opts.band_method;
  var makerOpts = Object.assign({}, opts, {
    geometry_type: 'polygon',
    left: side == 'left',
    right: side == 'right',
    // Winding-fill construction also enables overshoot-loop removal on the single
    // offset ring (see buildOneSidedRings); both are safe here because polygon
    // rings are closed and their offsets are doubly-covered.
    winding_fill: useWinding
  });
  return getPolylineBufferMaker(dataset, makerOpts);
}

function makePositivePolygonBufferGeometry(shape, distance, dataset, opts,
    leftBufferMaker) {
  // Non-topological positive buffers are never path-split (only the topological
  // pipeline splits, and it has its own function), so each shape's ring groups
  // are offset and dissolved directly.
  return makeClosedRingPositiveBufferGeometry(shape, dataset.arcs,
    distance, opts, leftBufferMaker);
}

function makeTopologicalPolygonBufferGeoJSON(lyr, dataset, opts, distanceFn,
    uniqueArcTest, outerMaker, holeEroder, bandFallbackMaker) {
  var shapes = lyr.shapes || [];
  var distances = [];
  var sourceIds = [];
  var bufferIds = [];
  var tmpGeometries = [];
  var hasPositiveDistance = false;
  var geometries, tmpDataset;

  shapes.forEach(function(shape, i) {
    sourceIds[i] = -1;
    bufferIds[i] = -1;
    distances[i] = distanceFn(i);
    if (distances[i] < 0) {
      stop('The topological buffer option does not support negative distances');
    }
    if (!shape) return;
    sourceIds[i] = tmpGeometries.length;
    tmpGeometries.push(getPolygonGeometry(shape, dataset.arcs));
  });

  profileStart('topo:offsets');
  shapes.forEach(function(shape, i) {
    var distance = distances[i];
    var bufferCoords;
    if (!distance || !shape) return;
    hasPositiveDistance = true;
    if (!opts.band_method && opts.clean_outline_winding &&
        !shapeHasFillInsideHole(shape, dataset.arcs)) {
      bufferCoords = makeTopologicalOutlineBufferCoords(shape, dataset.arcs,
        distance, uniqueArcTest, opts, outerMaker, holeEroder);
    } else {
      var pathData = getPolygonBufferPathData(shape, uniqueArcTest);
      var maker = bandFallbackMaker || outerMaker;
      bufferCoords = getBufferMultiPolygonCoords(pathData.paths, distance, maker);
      // Resolve winding-fill band rings' self-overlaps (the mosaic's boundary-
      // flood membership cannot). band-method feeds bands directly.
      if (!opts.band_method) {
        bufferCoords = dissolveOffsetRingsToCoords(bufferCoords, opts);
      }
    }
    if (bufferCoords.length > 0) {
      bufferIds[i] = tmpGeometries.length;
      tmpGeometries.push({
        type: 'MultiPolygon',
        coordinates: bufferCoords
      });
    }
  });
  profileEnd('topo:offsets');

  if (!hasPositiveDistance || tmpGeometries.length === 0) {
    geometries = shapes.map(function() { return null; });
  } else {
    tmpDataset = importGeoJSON({
      type: 'GeometryCollection',
      geometries: tmpGeometries
    }, {type: 'polygon'});
    geometries = makeTopologicalPolygonBufferGeometries(shapes, distances,
      sourceIds, bufferIds, tmpDataset, dataset.arcs,
      medialSmoothingEnabled(opts, distances));
  }
  return {
    geojson: {
      type: 'GeometryCollection',
      geometries: geometries
    },
    dissolveAfterSplit: hasPositiveDistance
  };
}

function makeTopologicalPolygonBufferGeometries(shapes, distances, sourceIds,
    bufferIds, tmpDataset, sourceArcs, medialSmooth) {
  // Inject inter-feature Voronoi (medial-axis) cut lines so the buffer mosaic's
  // contested tiles are subdivided along the equidistant boundary before the
  // tiles are assigned (see assignment by nearest source below).
  profileStart('topo:medial');
  var dataset = injectMedialCutLines(tmpDataset, shapes, distances, sourceArcs,
    medialSmooth);
  profileEnd('topo:medial');
  var tmpLyr = dataset.layers.filter(function(l) {
    return l.geometry_type == 'polygon';
  })[0];
  profileStart('topo:intersectionCuts');
  var nodes = addIntersectionCuts(dataset, {rebuild_topology: true});
  profileEnd('topo:intersectionCuts');
  profileStart('topo:mosaicIndex');
  var mosaicIndex = new MosaicIndex(tmpLyr, nodes, {flat: false, no_holes: false});
  profileEnd('topo:mosaicIndex');
  var pathfind = getRingIntersector(mosaicIndex.nodes);
  var sourceIdIndex = getIdLookup(sourceIds);
  var bufferIdIndex = getIdToFeatureIdLookup(bufferIds);
  var sourceAreas = getSourceShapeAreas(shapes, sourceArcs);
  var sourceInteriorPoints = getSourceInteriorPoints(shapes, sourceArcs);
  var ownerCtx = createTileOwnerContext(shapes, sourceArcs, sourceAreas,
    mosaicIndex.nodes.arcs);
  profileStart('topo:assignTiles');
  var result = shapes.map(function(shape, i) {
    var distance = distances[i];
    var tileIds, geom;
    if (!distance || !shape) return null;
    tileIds = getTopologicalBufferTileIds(sourceIds[i], bufferIds[i],
      i, mosaicIndex, sourceIdIndex, bufferIdIndex, ownerCtx);
    geom = getTileIdsGeometry(tileIds, mosaicIndex, pathfind);
    // Preserve holes that coincide with another feature's source territory (a
    // tile excluded to prevent buffer overlap, see getTopologicalBufferTileIds);
    // the single-shape artifact/sliver heuristics would otherwise fill them.
    return removePositiveBufferArtifactHoles(geom, shape, sourceArcs, distance,
      {points: sourceInteriorPoints, featureId: i});
  });
  profileEnd('topo:assignTiles');
  return result;
}

// Build the working dataset for the topological mosaic: the source/buffer
// polygons plus a polyline layer of inter-feature Voronoi cut-lines (so the
// contested tiles split along the equidistant boundary). Returns @tmpDataset
// unchanged when there are no contested edges (no overlap between features).
function injectMedialCutLines(tmpDataset, shapes, distances, arcs, medialSmooth) {
  var coordDistances = distances.map(function(d) {
    return d > 0 ? getCoordinateDistance(d, arcs) : 0;
  });
  var medial = buildInterFeatureMedialLines(shapes, coordDistances, arcs,
    {smooth: !!medialSmooth});
  if (!medial) return tmpDataset;
  var lineDataset = importGeoJSON({
    type: 'GeometryCollection',
    geometries: [medial]
  }, {});
  if (!lineDataset.arcs) return tmpDataset;
  return mergeDatasets([tmpDataset, lineDataset]);
}

// Whether to smooth the constructed medial cut-lines (Gaussian low-pass, see
// smoothMedialChain in mapshaper-buffer-voronoi). Smoothing replaces the discrete
// medial sampling's zigzag with a clean centerline; its scale is keyed per-chain
// to the local channel width, not to any distance computed here, so this is only
// an on/off gate. Off when the buffer's tolerance is explicitly disabled
// (tolerance=0, the "give me the raw medial" escape hatch) or when there is no
// positive buffer distance.
function medialSmoothingEnabled(opts, distances) {
  if (opts.tolerance === 0 || opts.tolerance == '0' || opts.tolerance == '0%') {
    return false;
  }
  for (var i = 0; i < distances.length; i++) {
    if (distances[i] > 0) return true;
  }
  return false;
}

// Per-feature buffer distances for the debug builders below, in meters and in
// source-coordinate units (matching what the topological pipeline computes).
function getMedialDebugDistances(lyr, dataset, opts) {
  var shapes = lyr.shapes || [];
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var distances = shapes.map(function(shape, i) {
    var d = shape ? distanceFn(i) : 0;
    return d > 0 ? d : 0;
  });
  var coordDistances = distances.map(function(d) {
    return d > 0 ? getCoordinateDistance(d, dataset.arcs) : 0;
  });
  return {shapes: shapes, distances: distances, coordDistances: coordDistances};
}

// Build a polyline dataset of the inter-feature medial-axis (Voronoi) cut-lines
// for the -buffer debug-voronoi option (topological only). These are the same
// lines injected into the mosaic to partition contested space, after the
// post-construction Gaussian smoothing.
function makeVoronoiDebugDataset(lyr, dataset, opts) {
  if (!opts.topological) {
    warn('debug-voronoi has no effect without the topological option; ignoring');
    return importGeoJSON({type: 'GeometryCollection', geometries: []}, {});
  }
  var d = getMedialDebugDistances(lyr, dataset, opts);
  var medial = buildInterFeatureMedialLines(d.shapes, d.coordDistances, dataset.arcs,
    {smooth: medialSmoothingEnabled(opts, d.distances)});
  var geometries = medial ? [medial] : [];
  return importGeoJSON({type: 'GeometryCollection', geometries: geometries}, {});
}

// Build a polygon dataset of the Delaunay triangulation of the adaptive sample
// sites for the -buffer debug-delaunay option (topological only) -- the mesh the
// medial axis is derived from.
function makeDelaunayDebugDataset(lyr, dataset, opts) {
  if (!opts.topological) {
    warn('debug-delaunay has no effect without the topological option; ignoring');
    return importGeoJSON({type: 'GeometryCollection', geometries: []}, {type: 'polygon'});
  }
  var d = getMedialDebugDistances(lyr, dataset, opts);
  var tris = buildInterFeatureDelaunay(d.shapes, d.coordDistances, dataset.arcs);
  // tris is a GeometryCollection of one Polygon per triangle; import it directly
  // so each triangle is its own feature (selectable/inspectable).
  return importGeoJSON(tris || {type: 'GeometryCollection', geometries: []},
    {type: 'polygon'});
}

function getTopologicalBufferTileIds(sourceId, bufferId, featureId, mosaicIndex,
    sourceIdIndex, bufferIdIndex, ownerCtx) {
  var ids = [];
  var index = [];
  addTileIds(ids, index, mosaicIndex.getTileIdsByShapeId(sourceId));
  if (bufferId >= 0) {
    addTileIds(ids, index, mosaicIndex.getTileIdsByShapeId(bufferId).filter(function(tileId) {
      return !tileHasSourcePolygon(tileId, mosaicIndex, sourceIdIndex) &&
        getBufferTileOwnerId(tileId, mosaicIndex, bufferIdIndex, ownerCtx) == featureId;
    }));
  }
  return ids;
}

// Per-mosaic context for nearest-source tile ownership. Source-shape segment
// indexes and tile representative points are built lazily and cached, since
// only a fraction of tiles are contested.
function createTileOwnerContext(shapes, sourceArcs, sourceAreas, mosaicArcs) {
  return {
    shapes: shapes,
    sourceArcs: sourceArcs,
    sourceAreas: sourceAreas,
    mosaicArcs: mosaicArcs,
    sourceIndexCache: [],
    anchorCache: []
  };
}

function addTileIds(memo, index, ids) {
  ids.forEach(function(id) {
    if (index[id]) return;
    index[id] = true;
    memo.push(id);
  });
}

function tileHasSourcePolygon(tileId, mosaicIndex, sourceIdIndex) {
  return mosaicIndex.getSourceIdsByTileId(tileId).some(function(shapeId) {
    return sourceIdIndex[shapeId];
  });
}

// Tiny relative tolerance for treating two source distances as equal (a tile
// sitting on the equidistant boundary), falling back to the largest-area then
// lowest-id rule for a deterministic result.
var OWNER_DIST_EPS = 1e-6;

// Owner of a contested buffer tile: among the features whose buffer covers the
// tile, the one whose source polygon is nearest to the tile's representative
// point. Choosing only among covering features means reassignment never creates
// a coverage gap (the tile is inside every candidate's buffer); the Voronoi
// cut-lines split tiles along the equidistant boundary so each sub-tile lies on
// one source's near side. Ties (a tile straddling the boundary, or one the
// medial axis did not reach) fall back to largest area then lowest id.
function getBufferTileOwnerId(tileId, mosaicIndex, bufferIdIndex, ownerCtx) {
  var candidates = [];
  mosaicIndex.getSourceIdsByTileId(tileId).forEach(function(shapeId) {
    var featureId = bufferIdIndex[shapeId];
    if (featureId >= 0) candidates.push(featureId);
  });
  if (candidates.length === 0) return -1;
  if (candidates.length === 1) return candidates[0];
  var p = getTileAnchorPoint(tileId, mosaicIndex, ownerCtx);
  if (!p) return pickLargestAreaFeature(candidates, ownerCtx.sourceAreas);
  var ownerId = -1;
  var bestDist = Infinity;
  var bestArea = -Infinity;
  for (var i = 0; i < candidates.length; i++) {
    var featureId = candidates[i];
    var dist = getPointToSourceDistance(p.x, p.y, featureId, ownerCtx);
    var area = ownerCtx.sourceAreas[featureId];
    var tol = bestDist === Infinity ? 0 :
      OWNER_DIST_EPS * Math.max(1, Math.abs(bestDist), Math.abs(dist));
    if (dist < bestDist - tol ||
        (Math.abs(dist - bestDist) <= tol &&
          (area > bestArea || area == bestArea && featureId < ownerId))) {
      ownerId = featureId;
      bestDist = dist;
      bestArea = area;
    }
  }
  return ownerId;
}

function pickLargestAreaFeature(candidates, sourceAreas) {
  var ownerId = -1;
  var ownerArea = -Infinity;
  candidates.forEach(function(featureId) {
    var area = sourceAreas[featureId];
    if (area > ownerArea || area == ownerArea && featureId < ownerId) {
      ownerId = featureId;
      ownerArea = area;
    }
  });
  return ownerId;
}

// Representative interior point of a mosaic tile, cached by tile id. Uses the
// pole of inaccessibility (findAnchorPoint), which is guaranteed to lie inside
// the tile -- unlike the centroid, which for a thin or curved contested strip
// (the sub-tiles the medial-axis cuts create along a narrow channel) can fall
// outside the tile, on the wrong side of the equidistant boundary, and so
// misclassify the strip's nearest source. The centroid is used only as a
// fallback if the anchor probe fails.
function getTileAnchorPoint(tileId, mosaicIndex, ownerCtx) {
  if (tileId in ownerCtx.anchorCache) return ownerCtx.anchorCache[tileId];
  var tile = mosaicIndex.mosaic[tileId];
  var p = findAnchorPoint(tile, ownerCtx.mosaicArcs) ||
    getPathCentroid(tile[0], ownerCtx.mosaicArcs) || null;
  ownerCtx.anchorCache[tileId] = p;
  return p;
}

// Distance from a point to a feature's source polygon, using a lazily-built and
// cached chunk-bounds segment index (see buildShapeSegmentIndex).
function getPointToSourceDistance(x, y, featureId, ownerCtx) {
  var index = ownerCtx.sourceIndexCache[featureId];
  if (!index) {
    index = ownerCtx.sourceIndexCache[featureId] =
      buildShapeSegmentIndex(ownerCtx.shapes[featureId], ownerCtx.sourceArcs);
  }
  return getPointToIndexedShapeDistance(x, y, index);
}

function getSourceShapeAreas(shapes, arcs) {
  return shapes.map(function(shape) {
    return Math.abs(getShapeArea(shape, arcs));
  });
}

// One interior point per positive ring-group (part) of every source shape,
// tagged with its feature id. A multipart source contributes a point for each
// detached part (e.g. a small island ring), so the topological hole filter can
// recognize a neighbor's territory even when it is one part of a multipolygon.
function getSourceInteriorPoints(shapes, arcs) {
  var points = [];
  shapes.forEach(function(shape, featureId) {
    if (!shape) return;
    getPolygonRingGroupShapes(shape, arcs).forEach(function(group) {
      var p = findAnchorPoint(group, arcs);
      if (p) points.push({x: p.x, y: p.y, featureId: featureId});
    });
  });
  return points;
}

function getIdLookup(ids) {
  var index = [];
  ids.forEach(function(id) {
    if (id >= 0) index[id] = true;
  });
  return index;
}

function getIdToFeatureIdLookup(ids) {
  var index = [];
  ids.forEach(function(id, i) {
    if (id >= 0) index[id] = i;
  });
  return index;
}

function getTileIdsGeometry(tileIds, mosaicIndex, pathfind) {
  var rings = [];
  var holes = [];
  var shp;
  tileIds.forEach(function(tileId) {
    var tile = mosaicIndex.mosaic[tileId];
    rings.push(tile[0]);
    if (tile.length > 1) {
      holes = holes.concat(tile.slice(1));
    }
  });
  shp = pathfind(rings.concat(holes), 'dissolve');
  if (shp && shp.length > 0) {
    shp = fixNestingErrors(shp, mosaicIndex.nodes.arcs);
  }
  return shp && shp.length > 0 ? getPolygonGeometry(shp, mosaicIndex.nodes.arcs) : null;
}

function dissolvePolygonBufferGeometry(geom, opts) {
  var tmp = importGeoJSON({
    type: 'GeometryCollection',
    geometries: [geom]
  }, {type: 'polygon'});
  var lyr = tmp.layers[0];
  if (tmp.arcs) {
    dissolveBufferDataset2(tmp, opts);
  }
  if (lyr.shapes && lyr.shapes[0]) {
    lyr.shapes[0] = fixNestingErrors(lyr.shapes[0], tmp.arcs);
  }
  return lyr.shapes && lyr.shapes[0] ?
    getPolygonGeometry(lyr.shapes[0], tmp.arcs) : null;
}

function makeNegativePolygonBufferGeometry(shape, distance, dataset, opts,
    bufferMaker) {
  // Non-topological negative buffers are never path-split, so each shape's ring
  // groups are offset and eroded directly.
  return makeClosedRingNegativeBufferGeometry(shape, dataset.arcs, distance,
    opts, bufferMaker);
}

function makeClosedRingNegativeBufferGeometry(shape, arcs, distance, opts,
    bufferMaker) {
  var coords = [];
  getPolygonRingGroupShapes(shape, arcs).forEach(function(groupShape) {
    var bufferCoords = getBufferMultiPolygonCoords(groupShape, distance, bufferMaker);
    var geom = bufferCoords.length > 0 ?
      makeClosedRingBufferGeometry(groupShape, arcs, getBufferDataset(bufferCoords),
        opts, distance, true) : null;
    if (geom) {
      coords = coords.concat(geom.coordinates);
    }
  });
  return coords.length > 0 ? {
    type: 'MultiPolygon',
    coordinates: coords
  } : null;
}

function makeClosedRingPositiveBufferGeometry(shape, arcs, distance, opts,
    bufferMaker) {
  var coords = [];
  var groupShapes = getPolygonRingGroupShapes(shape, arcs);
  groupShapes.forEach(function(groupShape) {
    var bufferCoords = getBufferMultiPolygonCoords(groupShape, distance, bufferMaker);
    var geom = bufferCoords.length > 0 ?
      makeClosedRingBufferGeometry(groupShape, arcs, getBufferDataset(bufferCoords),
        opts, distance, false) : null;
    if (geom) {
      coords = coords.concat(geom.coordinates);
    } else {
      coords = coords.concat(getPolygonMultiPolygonCoords(groupShape, arcs));
    }
  });
  if (coords.length === 0) return null;
  var geom = {
    type: 'MultiPolygon',
    coordinates: coords
  };
  if (shouldDissolveBufferedRingGroups(groupShapes, arcs, distance)) {
    geom = dissolvePolygonBufferGeometry(geom, opts);
  }
  return removePositiveBufferArtifactHoles(geom, shape, arcs, distance);
}

// True if any two of a feature's buffered ring groups are close enough that
// their buffers might merge (so the group buffers should be dissolved together
// rather than emitted as separate polygons).
function shouldDissolveBufferedRingGroups(groupShapes, arcs, distance) {
  var threshold = getCoordinateDistance(distance, arcs) * 2;
  var n = groupShapes.length;
  if (n < 2) return false;
  // Bounding-box prefilter + early exit. The old code computed the exact min
  // distance over every group pair (O(groups^2 * verts * segs)) -- the dominant
  // cost when a feature has many islands. Two groups can only be within
  // @threshold if their bounding boxes are, so the box test skips the costly
  // vertex-by-vertex distance for all far-apart pairs (the common case), and we
  // return as soon as one near pair is found. Result is identical to
  // (min inter-group distance <= threshold).
  var bounds = groupShapes.map(function(shp) {
    return arcs.getMultiShapeBounds(shp);
  });
  for (var i = 0; i < n - 1; i++) {
    for (var j = i + 1; j < n; j++) {
      if (boundsToBoundsDistance(bounds[i], bounds[j]) > threshold) continue;
      if (getShapeToShapeDistance(groupShapes[i], groupShapes[j], arcs, threshold) <= threshold ||
          getShapeToShapeDistance(groupShapes[j], groupShapes[i], arcs, threshold) <= threshold) {
        return true;
      }
    }
  }
  return false;
}

// Minimum distance between two axis-aligned bounding boxes (0 if they overlap).
function boundsToBoundsDistance(a, b) {
  var dx = Math.max(0, a.xmin - b.xmax, b.xmin - a.xmax);
  var dy = Math.max(0, a.ymin - b.ymax, b.ymin - a.ymax);
  return Math.sqrt(dx * dx + dy * dy);
}

// Min distance from the vertices of @shape1 to @shape2. Stops early once a
// vertex within @maxDist (optional) is found, since callers only compare the
// result against a threshold.
function getShapeToShapeDistance(shape1, shape2, arcs, maxDist) {
  var data = exportPathData(shape1, arcs, 'polygon');
  var minDist = Infinity;
  var paths = data.pathData;
  for (var i = 0; i < paths.length; i++) {
    var points = paths[i].points;
    for (var j = 0; j < points.length; j++) {
      var d = getPointToShapeDistance(points[j][0], points[j][1], shape2, arcs);
      if (d < minDist) minDist = d;
      if (maxDist != null && minDist <= maxDist) return minDist;
    }
  }
  return minDist;
}

function makeClosedRingBufferGeometry(shape, arcs, bufferDataset, opts, distance,
    reverse) {
  var sourceAreas = exportPathData(shape, arcs, 'polygon').pathData.map(function(path) {
    return path.area;
  });
  var sourceBoundaryThreshold = getSourceBoundaryThreshold(distance, arcs);
  var bufferLyr = bufferDataset.layers[0];
  var bufferShape, bufferData, erodedShape;
  if (!bufferDataset.arcs) return null;
  // The default offset rings come from the winding-fill maker (one self-
  // overlapping ring per source ring) and must be unioned by winding number;
  // the band-method fallback emits overlapping bands that a boundary flood
  // resolves instead (its maker leaves winding_fill off to match).
  dissolveBufferDataset2(bufferDataset,
    Object.assign({}, opts, {winding_fill: !opts.band_method}));
  bufferShape = bufferLyr.shapes && bufferLyr.shapes[0];
  if (!bufferShape) return null;
  bufferData = exportPathData(bufferShape, bufferDataset.arcs, 'polygon');
  // Build the source-shape segment index once: ringIsOnSourceBoundary probes
  // ~20 points of every eroded buffer ring against the same source shape, and
  // on large rings the unindexed per-point distance scan dominated runtime.
  var sourceIndex = buildShapeSegmentIndex(shape, arcs);
  erodedShape = bufferData.pathData.reduce(function(memo, path) {
    if (!areaMatchesAny(path.area, sourceAreas) &&
        !ringIsOnSourceBoundary(path.points, sourceIndex, sourceBoundaryThreshold)) {
      memo.push(reverse ? reversePath(path.ids.concat()) : path.ids.concat());
    }
    return memo;
  }, []);
  return erodedShape.length > 0 ?
    getPolygonGeometry(erodedShape, bufferDataset.arcs) : null;
}

function getPolygonRingGroupShapes(shape, arcs) {
  var data = exportPathData(shape, arcs, 'polygon');
  if (data.pointCount === 0) return [];
  return groupPolygonRings(data.pathData, arcs, false).map(function(paths) {
    return paths.map(function(path) {
      return path.ids.concat();
    });
  });
}

// True if the buffer geometry has any interior ring (a candidate artifact
// hole). A clean positive grow -- the common case, e.g. a hole-free coastline
// dissolved by the winding-number fill -- has none, so the (potentially large)
// source-shape spatial indexes below need never be built.
function bufferGeomHasCandidateHole(geom) {
  if (geom.type == 'Polygon') return geom.coordinates.length > 1;
  if (geom.type == 'MultiPolygon') {
    return geom.coordinates.some(function(polygon) { return polygon.length > 1; });
  }
  return false;
}

// @territory (optional, topological pipeline only): {points, featureId} where
// points are source-part interior points tagged by feature id; a candidate hole
// enclosing another feature's point is that neighbor's territory (excluded to
// prevent overlap) and is always kept.
function removePositiveBufferArtifactHoles(geom, shape, arcs, distance, territory) {
  if (!geom) return null;
  // Nothing to filter unless the result actually has interior rings. Skip the
  // index build (filterArtifactHoles is itself a no-op on hole-free polygons,
  // so this only avoids needless work, not any classification).
  if (!bufferGeomHasCandidateHole(geom)) return geom;
  var threshold = getPositiveHoleArtifactThreshold(distance, arcs);
  var minHoleArea = getPositiveHoleArtifactAreaThreshold(distance, arcs);
  var sourceHoles = getSourceHoleShapes(shape, arcs);
  // Each candidate hole is classified by probing many points against the
  // source shape. Both per-probe tests used to rescan the whole source shape:
  //   - "is the probe inside the source shape?" (testPointInPolygon)
  //   - "is the probe near a source hole boundary?" (point-to-shape distance)
  // On large rings (e.g. a U.S. state buffer) this point-in-ring scan dominated
  // runtime. Build the spatial indexes once per feature instead:
  //   - PathIndex.pointIsEnclosed() runs point-in-polygon via a per-ring
  //     scanline index (O(log n) per probe instead of O(n)).
  //   - shapeIndex / holeIndex are chunk-bounds indexes that prune far segments
  //     for the point-to-shape distance queries.
  var ctx = {
    arcs: arcs,
    threshold: threshold,
    shapeIndex: buildShapeSegmentIndex(shape, arcs),
    pathIndex: shape && shape.length > 0 ? new PathIndex([shape], arcs) : null,
    holeIndex: sourceHoles.length > 0 ?
      buildShapeSegmentIndex(sourceHoles.map(function(h) {return h[0];}), arcs) : null,
    territoryPoints: territory ? territory.points : null,
    featureId: territory ? territory.featureId : -1
  };
  if (geom.type == 'Polygon') {
    geom.coordinates = filterArtifactHoles(geom.coordinates, minHoleArea, ctx);
  } else if (geom.type == 'MultiPolygon') {
    geom.coordinates = geom.coordinates.map(function(polygon) {
      return filterArtifactHoles(polygon, minHoleArea, ctx);
    }).filter(function(polygon) {
      return polygon.length > 0;
    });
  }
  return geom;
}

// Flatten a shape's path segments into fixed-size chunks (per path) with a
// bounding box each. A chunk's box distance is a lower bound on the distance to
// any of its segments, so a point-to-shape distance query can skip whole chunks
// whose box is already farther than the closest segment found so far. Source
// paths are spatially coherent, so each chunk's box is tight. Coords are stored
// flat ([ax, ay, bx, by, ...]) to avoid per-segment array allocation.
var SHAPE_SEGMENT_CHUNK_SIZE = 32;

function buildShapeSegmentIndex(shape, arcs) {
  var coords = [];
  var chunks = [];
  (shape || []).forEach(function(ids) {
    var iter = arcs.getShapeIter(ids);
    if (!iter.hasNext()) return;
    var ax = iter.x, ay = iter.y;
    var inChunk = 0;
    var xmin = 0, ymin = 0, xmax = 0, ymax = 0, start = 0;
    while (iter.hasNext()) {
      var bx = iter.x, by = iter.y;
      if (inChunk === 0) {
        start = coords.length / 4;
        xmin = Math.min(ax, bx); xmax = Math.max(ax, bx);
        ymin = Math.min(ay, by); ymax = Math.max(ay, by);
      } else {
        if (ax < xmin) xmin = ax; else if (ax > xmax) xmax = ax;
        if (bx < xmin) xmin = bx; else if (bx > xmax) xmax = bx;
        if (ay < ymin) ymin = ay; else if (ay > ymax) ymax = ay;
        if (by < ymin) ymin = by; else if (by > ymax) ymax = by;
      }
      coords.push(ax, ay, bx, by);
      inChunk++;
      if (inChunk === SHAPE_SEGMENT_CHUNK_SIZE) {
        chunks.push({start: start, end: coords.length / 4,
          xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax});
        inChunk = 0;
      }
      ax = bx; ay = by;
    }
    if (inChunk > 0) {
      chunks.push({start: start, end: coords.length / 4,
        xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax});
    }
  });
  return {coords: coords, chunks: chunks};
}

// Same result as getPointToShapeDistance(px, py, shape, arcs), but using the
// chunk bounding boxes to prune. Scan the nearest-box chunk first to seed a
// tight bound, then skip any chunk whose box is farther than that bound. No
// per-query allocation or sorting.
function getPointToIndexedShapeDistance(px, py, index) {
  var chunks = index.chunks, coords = index.coords;
  var n = chunks.length;
  if (n === 0) return Infinity;
  var bestSq = Infinity;
  var nearIdx = -1, nearBoxSq = Infinity, boxSq, c, k;
  for (c = 0; c < n; c++) {
    boxSq = shapeChunkBoxDistSq(px, py, chunks[c]);
    if (boxSq < nearBoxSq) { nearBoxSq = boxSq; nearIdx = c; }
  }
  bestSq = scanShapeChunk(px, py, coords, chunks[nearIdx], bestSq);
  for (k = 0; k < n; k++) {
    if (k === nearIdx) continue;
    if (shapeChunkBoxDistSq(px, py, chunks[k]) >= bestSq) continue;
    bestSq = scanShapeChunk(px, py, coords, chunks[k], bestSq);
  }
  return Math.sqrt(bestSq);
}

function scanShapeChunk(px, py, coords, chunk, bestSq) {
  for (var i = chunk.start; i < chunk.end; i++) {
    var o = i * 4;
    var d = pointSegDistSq2(px, py, coords[o], coords[o + 1], coords[o + 2], coords[o + 3]);
    if (d < bestSq) bestSq = d;
  }
  return bestSq;
}

function shapeChunkBoxDistSq(px, py, chunk) {
  var dx = px < chunk.xmin ? chunk.xmin - px : (px > chunk.xmax ? px - chunk.xmax : 0);
  var dy = py < chunk.ymin ? chunk.ymin - py : (py > chunk.ymax ? py - chunk.ymax : 0);
  return dx * dx + dy * dy;
}

function getSourceHoleShapes(shape, arcs) {
  return exportPathData(shape, arcs, 'polygon').pathData.reduce(function(memo, path) {
    if (path.area < 0) {
      memo.push([path.ids]);
    }
    return memo;
  }, []);
}

function filterArtifactHoles(polygon, minHoleArea, ctx) {
  if (polygon.length < 2) return polygon;
  return [polygon[0]].concat(polygon.slice(1).filter(function(ring) {
    // A hole over another feature's source is real territory (kept regardless of
    // size or how deep it sits in this feature's buffer); see getSourceInteriorPoints.
    if (ringEnclosesOtherTerritory(ring, ctx)) return true;
    return Math.abs(getGeoJSONRingArea(ring)) > minHoleArea &&
      !positiveBufferHoleIsArtifact(ring, ctx);
  }));
}

function ringEnclosesOtherTerritory(ring, ctx) {
  var points = ctx.territoryPoints;
  if (!points) return false;
  var bounds = getGeoJSONRingBounds(ring);
  for (var i = 0; i < points.length; i++) {
    if (points[i].featureId === ctx.featureId) continue;
    if (!pointInGeoJSONRingBounds(points[i].x, points[i].y, bounds)) continue;
    if (pointInGeoJSONRing(points[i].x, points[i].y, ring)) return true;
  }
  return false;
}

function getGeoJSONRingBounds(ring) {
  var n = ring.length - 1; // skip duplicate closing vertex
  if (n <= 0) n = ring.length;
  var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  var i, x, y;
  for (i = 0; i < n; i++) {
    x = ring[i][0];
    y = ring[i][1];
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  return {xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax};
}

function pointInGeoJSONRingBounds(x, y, bounds) {
  return x >= bounds.xmin && x <= bounds.xmax &&
    y >= bounds.ymin && y <= bounds.ymax;
}

// Ray-casting point-in-ring test for a closed GeoJSON ring (array of [x, y],
// first == last). Boundary cases are irrelevant here: territory probe points are
// well inside their source part, far from any hole-ring edge.
function pointInGeoJSONRing(x, y, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0], yi = ring[i][1];
    var xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) &&
        x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function positiveBufferHoleIsArtifact(ring, ctx) {
  var n = ring.length - 1; // skip duplicate endpoint
  var step = Math.max(1, Math.floor(n / 20));
  var p, p2;
  for (var i = 0; i < n; i += step) {
    p = ring[i];
    if (pointIsDeepInsidePositiveBuffer(p, ctx)) return true;
    p2 = ring[(i + 1) % n];
    if (pointIsDeepInsidePositiveBuffer([(p[0] + p2[0]) / 2, (p[1] + p2[1]) / 2], ctx)) return true;
  }
  return false;
}

function pointIsDeepInsidePositiveBuffer(p, ctx) {
  if (ctx.holeIndex &&
      getPointToIndexedShapeDistance(p[0], p[1], ctx.holeIndex) < ctx.threshold) {
    return false;
  }
  if (ctx.pathIndex && ctx.pathIndex.pointIsEnclosed(p)) return true;
  // A positive buffer can shrink legitimate source holes, leaving their
  // boundaries near the original rings. Don't classify those as artifacts.
  return getPointToIndexedShapeDistance(p[0], p[1], ctx.shapeIndex) < ctx.threshold;
}

function getPositiveHoleArtifactThreshold(distance, arcs) {
  return getCoordinateDistance(distance, arcs) * 0.5;
}

// Minimum area for a grow-generated interior ring to be treated as a real hole
// rather than numerical noise. A positive buffer can legitimately enclose a hole
// far smaller than the buffer disk (a pocket between source arms whose mouth just
// closed leaves an arbitrarily small gap), so this is only a degenerate-sliver
// floor -- a tiny fraction of the buffer-disk area -- NOT a "holes smaller than
// the radius are artifacts" rule. (It used to be the full disk area d*d, which
// silently deleted real holes whose area was less than the radius squared; the
// near-source boundary classifier in positiveBufferHoleIsArtifact is what
// actually distinguishes self-overlap artifacts from real holes.)
function getPositiveHoleArtifactAreaThreshold(distance, arcs) {
  var d = getCoordinateDistance(distance, arcs);
  return d * d * 0.01;
}

function getGeoJSONRingArea(ring) {
  var sum = 0;
  for (var i = 0, n = ring.length - 1; i < n; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

function areaMatchesAny(area, arr) {
  return arr.some(function(area2) {
    var tol = Math.max(1e-8, Math.abs(area2) * 1e-9);
    return Math.abs(Math.abs(area) - Math.abs(area2)) <= tol;
  });
}

function getSourceBoundaryThreshold(distance, arcs) {
  return getCoordinateDistance(distance, arcs) * 0.25;
}

function getCoordinateDistance(distance, arcs) {
  return arcs.isPlanar() ? distance : distance / R * R2D;
}

// @shapeIndex: chunk-bounds index of the source shape (see buildShapeSegmentIndex)
function ringIsOnSourceBoundary(points, shapeIndex, threshold) {
  var n = points.length - 1; // skip duplicate endpoint
  var step = Math.max(1, Math.floor(n / 20));
  var sum = 0;
  var count = 0;
  for (var i = 0; i < n; i += step) {
    sum += getPointToIndexedShapeDistance(points[i][0], points[i][1], shapeIndex);
    count++;
  }
  return count > 0 && sum / count < threshold;
}

function getPolygonMultiPolygonCoords(shape, arcs) {
  var data = exportPathData(shape, arcs, 'polygon');
  if (data.pointCount === 0) return [];
  return groupPolygonRings(data.pathData, arcs, false).map(function(paths) {
    return paths.map(function(path) {
      return path.points.map(function(p) {
        return p.concat();
      });
    });
  });
}

function getPolygonGeometry(shape, arcs) {
  var coords = getPolygonMultiPolygonCoords(shape, arcs);
  return coords.length > 0 ? {
    type: 'MultiPolygon',
    coordinates: coords
  } : null;
}

function getBufferDataset(coords) {
  return importGeoJSON({
    type: 'GeometryCollection',
    geometries: [{
      type: 'MultiPolygon',
      coordinates: coords
    }]
  }, {type: 'polygon'});
}

// Union a set of winding-fill offset rings (which self-overlap) into clean,
// non-self-overlapping MultiPolygon coordinates, via the winding-number
// dissolve. Used by the topological pipeline to feed an ordinary polygon into
// the shared mosaic (whose boundary-flood membership cannot resolve the
// self-overlapping construction ring directly).
function dissolveOffsetRingsToCoords(coords, opts, outlineDissolve) {
  if (!coords || coords.length === 0) return [];
  var dataset = getBufferDataset(coords);
  if (!dataset.arcs) return [];
  var dissolveOpts = outlineDissolve ?
    getOutlineBufferDissolveOpts(opts) :
    Object.assign({}, opts, {winding_fill: true});
  dissolveBufferDataset2(dataset, dissolveOpts);
  var lyr = dataset.layers[0];
  var shape = lyr.shapes && lyr.shapes[0];
  return shape ? getPolygonMultiPolygonCoords(shape, dataset.arcs) : [];
}

function getBufferMultiPolygonCoords(paths, distance, bufferMaker) {
  var features, coords = [];
  if (paths.length === 0) return coords;
  features = bufferMaker(paths, distance) || [];
  features.forEach(function(feat) {
    var geom = feat && feat.geometry;
    if (geom && geom.type == 'MultiPolygon') {
      coords = coords.concat(geom.coordinates);
    }
  });
  return coords;
}

function getPolygonBufferPathData(shape, uniqueArcTest) {
  var data = {paths: [], split: false};
  (shape || []).forEach(function(path) {
    var paths = uniqueArcTest ? splitPathAtSharedArcs(path, uniqueArcTest) :
      [path.concat()];
    if (paths.length != 1 || paths[0].length != path.length ||
        !paths[0].every(function(arcId, i) {
      return arcId == path[i];
    })) {
      data.split = true;
    }
    data.paths = data.paths.concat(paths);
  });
  return data;
}

function splitPathAtSharedArcs(path, uniqueArcTest) {
  var flags = path.map(uniqueArcTest);
  var firstShared = flags.indexOf(false);
  var chains = [];
  var chain = [];
  var start, i, arcId;
  if (firstShared == -1) return [path.concat()];
  start = (firstShared + 1) % path.length;
  for (i = 0; i < path.length; i++) {
    arcId = path[(start + i) % path.length];
    if (uniqueArcTest(arcId)) {
      chain.push(arcId);
    } else if (chain.length > 0) {
      chains.push(chain);
      chain = [];
    }
  }
  if (chain.length > 0) {
    chains.push(chain);
  }
  return chains;
}

function getUniqueArcTest(lyr, arcs) {
  var classify = getArcClassifier(lyr, arcs, {reusable: true})(function(a, b) {
    return b == -1 ? 'unique' : null;
  });
  return function(arcId) {
    return !!classify(arcId);
  };
}
