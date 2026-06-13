import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { convertDistanceParam } from '../geom/mapshaper-units';
import { parseMeasure2 } from '../geom/mapshaper-units';
import { reversePath } from '../paths/mapshaper-path-utils';
import { getHoleDivider } from '../polygons/mapshaper-polygon-holes';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { getRingIntersector } from '../paths/mapshaper-pathfinder';
import { composeMosaicLayer } from '../dissolve/mapshaper-polygon-dissolve2';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { stop } from '../utils/mapshaper-logging';
import { DataTable } from '../datatable/mapshaper-data-table';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';
import { rewindPolygonParts } from '../polygons/mapshaper-polygon-repair';

export function dissolveBufferDataset2(dataset, optsArg) {
  var opts = optsArg || {};
  var lyr = dataset.layers.filter(function(l) { return l.geometry_type == 'polygon'; })[0] ||
    dataset.layers[0];
  var tmp;
  if (opts.debug_offset) {
    return; // raw offset path
  }
  var nodes = addIntersectionCuts(dataset, {rebuild_topology: true});
  // The polyline buffer pipeline adds each feature's source path as a coincident
  // polyline so it cuts the buffer rings; once intersection cutting has spliced
  // those arcs into the shared topology the path layer has served its purpose
  // and is dropped, leaving only the polygon buffer rings to dissolve.
  if (dataset.layers.length > 1) {
    dataset.layers = dataset.layers.filter(function(l) { return l.geometry_type == 'polygon'; });
  }
  // per_part_holes (set by the polyline buffer pipeline): its shapes'
  // rings are independent overlapping pieces of one union, not a polygon
  // with holes; see PolygonTiler. The polygon buffer pipeline dissolves
  // shapes that mix buffer rings with real polygon holes, and keeps the
  // shape-wide hole semantics.
  var mosaicIndex = new MosaicIndex(lyr, nodes,
    {flat: false, no_holes: false, per_part_holes: !!opts.per_part_holes});

  // rewindPolygonParts(lyr, nodes);
  if (opts.debug_winding) {
    lyr.shapes = lyr.shapes.map(function(shp, i) {
      var tiles = mosaicIndex.getTilesByShapeIds([i]);
      if (!tiles.length) return null;
      var parts = [];
      tiles.forEach(function(tile) {
        parts.push.apply(parts, tile);
      });
      return parts;
    });
    return;
  }

  if (opts.debug_mosaic) {
    tmp = composeMosaicLayer(lyr, mosaicIndex.mosaic);
    lyr.shapes = tmp.shapes;
    lyr.data = tmp.data;
    return;
  }
  var pathfind = getRingIntersector(mosaicIndex.nodes);
  var shapes2 = lyr.shapes.map(function(shp, shapeId) {
    var tiles = opts.winding_fill ?
      mosaicIndex.getWindingTilesByShapeId(shapeId) :
      mosaicIndex.getTilesByShapeIds([shapeId]);
    var rings = [];
    var holes = [];
    for (var i=0; i<tiles.length; i++) {
      rings.push(tiles[i][0]);
      if (tiles[i].length > 1) {
        holes = holes.concat(tiles[i].slice(1));
      }
    }
    return pathfind(rings.concat(holes), 'dissolve');
  });
  lyr.shapes = shapes2;
  if (!opts.no_dissolve) {
    dissolveArcs(dataset);
  }
}

// Build an array (indexed by polygon-layer shape id) of the directed path arcs
// for each buffer shape, grouped by source ring/part, matched through the
// __bufsrc tag shared by a buffer feature and its coincident source-path
// polyline feature. Wrong-side lobe removal walls each ring by its own arcs,
// so the per-ring grouping must be preserved (a multi-ring feature's rings may
// have overlapping bands).
export function getPathArcsByShape(dataset, polyLyr) {
  var pathLyr = dataset.layers.filter(function(l) {
    return l.geometry_type == 'polyline';
  })[0];
  if (!pathLyr || !pathLyr.data) return null;
  var pathRecords = pathLyr.data.getRecords();
  var partsBySrc = {};
  pathLyr.shapes.forEach(function(shp, i) {
    var src = pathRecords[i] && pathRecords[i].__bufsrc;
    if (src == null) return;
    partsBySrc[src] = (shp || []).map(function(part) { return part; });
  });
  var polyRecords = polyLyr.data && polyLyr.data.getRecords();
  return polyLyr.shapes.map(function(shp, i) {
    var src = polyRecords && polyRecords[i] && polyRecords[i].__bufsrc;
    return src == null ? null : (partsBySrc[src] || null);
  });
}

// TODO: try geodesic option
export function getIntersectionFunction(crs) {
  return bufferSegmentIntersection;
}

export function dissolveBufferDataset(dataset, optsArg) {
  var opts = optsArg || {};
  var lyr = dataset.layers[0];
  var tmp;
  if (opts.debug_offset) {
    return; // raw offset path
  }
  var nodes = addIntersectionCuts(dataset, {rebuild_topology: true});
  if (opts.debug_winding) {
    rewindPolygonParts(lyr, nodes);
    // debugRingsAndHoles(lyr, nodes);
    return;
  }
  rewindPolygonParts(lyr, nodes);

  var mosaicIndex = new MosaicIndex(lyr, nodes, {flat: false, no_holes: false});
  if (opts.debug_mosaic) {
    tmp = composeMosaicLayer(lyr, mosaicIndex.mosaic);
    lyr.shapes = tmp.shapes;
    lyr.data = tmp.data;
    return;
  }
  var pathfind = getRingIntersector(mosaicIndex.nodes);
  var shapes2 = lyr.shapes.map(function(shp, shapeId) {
    var tiles = mosaicIndex.getTilesByShapeIds([shapeId]);
    var rings = [];
    for (var i=0; i<tiles.length; i++) {
      rings.push(tiles[i][0]);
    }
    return pathfind(rings, 'dissolve');
  });
  lyr.shapes = shapes2;
  if (!opts.no_dissolve) {
    dissolveArcs(dataset);
  }
}


function debugRingsAndHoles(lyr, nodes) {
  var divide = getHoleDivider(nodes);
  var shapes2 = [];
  var records = [];
  lyr.shapes.forEach(divideShape);
  lyr.shapes = shapes2;
  lyr.data = new DataTable(records);
  return lyr;

  function divideShape(shp) {
    var cw = [], ccw = [];
    divide(shp, cw, ccw);
    cw.forEach(function(ring) {
      shapes2.push([ring]);
      records.push({type: 'ring'});
    });
    ccw.forEach(function(hole) {
      shapes2.push([reversePath(hole)]);
      records.push({type: 'hole'});
    });
  }
}

// n = number of segments used to approximate a circle
// Returns tolerance as a percent of circle radius
export function getBufferToleranceFromCircleSegments(n) {
  return 1 - Math.cos(Math.PI / n);
}

export function getArcDegreesFromTolerancePct(pct) {
  return 360 * Math.acos(1 - pct) / Math.PI;
}

// n = number of segments used to approximate a circle
// Returns tolerance as a percent of circle radius
export function getBufferToleranceFromCircleSegments2(n) {
  return 1 / Math.cos(Math.PI / n) - 1;
}

export function getArcDegreesFromTolerancePct2(pct) {
  return 360 * Math.acos(1 / (pct + 1)) / Math.PI;
}

// return constant distance in meters, or return null if unparsable
export function parseConstantBufferDistance(str, crs) {
  var parsed = parseMeasure2(str);
  if (!parsed.value) return null;
  return convertDistanceParam(str, crs) || null;
}

export function getBufferToleranceFunction(dataset, opts) {
  var crs = getDatasetCRS(dataset);
  var tol = parseBufferTolerance(opts.tolerance, crs);
  return function(meterDist) {
    return tol.distance || meterDist * tol.pct;
  };
}

function parseBufferTolerance(tolerance, crs) {
  var str = tolerance || '';
  var pctMatch = typeof str == 'string' &&
    /^([+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?)%$/i.exec(str.trim());
  if (pctMatch) {
    return {
      distance: 0,
      pct: Number(pctMatch[1]) / 100
    };
  }
  return {
    distance: tolerance ? parseConstantBufferDistance(tolerance, crs) : 0,
    pct: 1/100
  };
}

// Douglas-Peucker interval used to pre-simplify paths before buffering, as
// a multiple of the acceptable buffer error (the tolerance option, by
// default 1% of the buffer radius). Determined empirically: the median
// outline deviation stays around 1% of the interval (D.P. retains locally
// extreme vertices, which are the vertices that determine the buffer
// outline), but the 99th-percentile deviation approaches the interval
// itself and grows faster than linearly past a factor of ~2, so the
// interval is kept equal to the stated error budget.
var BUFFER_SIMPLIFY_FACTOR = 1;

// Returns a function mapping buffer distance to a pre-simplification
// interval (in meters, or CRS units for projected data), or null if
// pre-simplification is disabled. Enabled by default with a tolerance of
// 1% of the buffer radius; pass an explicit tolerance to change the error
// budget, or tolerance=0 to disable pre-simplification.
// For a two-sided buffer (the set of points within the buffer distance of
// the path), the error is bounded by the path's positional deviation. Cap
// geometry and one-sided buffers also depend on segment bearings; the
// simplification stage preserves them by pinning the paths' end segments
// and capping the turning concentrated by removed sub-paths (see
// presimplifyPathVerts in mapshaper-path-buffer-v4.mjs).
export function getBufferSimplifyFunction(dataset, opts) {
  if (opts.tolerance === 0 || opts.tolerance == '0' || opts.tolerance == '0%') return null;
  var tolFn = getBufferToleranceFunction(dataset, opts);
  return function(meterDist) {
    return tolFn(meterDist) * BUFFER_SIMPLIFY_FACTOR;
  };
}

export function getBufferDistanceFunction(lyr, dataset, opts) {
  if (!opts.radius) {
    stop('Missing expected radius parameter');
  }
  var crs = getDatasetCRS(dataset);
  var constDist = parseConstantBufferDistance(opts.radius, crs);
  if (constDist) return function() {return constDist;};
  var expr = compileFeatureExpression(opts.radius, lyr, null); // no arcs
  return function(shpId) {
    var val = expr(shpId);
    if (!val) return 0;
    // TODO: optimize common case that expression returns a number
    var dist = parseConstantBufferDistance(val, crs);
    return dist || 0;
  };
}


export function bufferSegmentIntersection(a, b, c, d) {
  return bufferIntersection2(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
}

// Fast segment intersection for buffer construction geometry (joins,
// section splits, closures). Join vertices are approximation geometry, so a
// small positional error when segments are nearly parallel is harmless.
// This used to call the topology-grade segmentIntersection(), which
// switches to robust BigInt math when segments are nearly parallel --
// consecutive offset segments meet at the path's bend angle, so paths with
// many shallow bends made buffer construction disproportionately expensive
// (on a large test file, buffer construction generated ~4% of all
// segment-intersection calls but ~60% of the robust BigInt calls).
// Returns [x, y] or null. Endpoint touches count as intersections;
// collinear overlaps return null (callers fall back to other join logic).
export function bufferIntersection2(ax, ay, bx, by, cx, cy, dx, dy) {
  // exclude segments with non-intersecting bounding boxes
  if (ax < cx && ax < dx && bx < cx && bx < dx ||
      ax > cx && ax > dx && bx > cx && bx > dx ||
      ay < cy && ay < dy && by < cy && by < dy ||
      ay > cy && ay > dy && by > cy && by > dy) return null;
  var abx = bx - ax, aby = by - ay;
  var cdx = dx - cx, cdy = dy - cy;
  var den = abx * cdy - aby * cdx;
  if (den === 0) return null; // parallel or collinear
  var acx = cx - ax, acy = cy - ay;
  var t = (acx * cdy - acy * cdx) / den;
  var u = (acx * aby - acy * abx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [ax + t * abx, ay + t * aby];
}
