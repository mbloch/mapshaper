
import { TileShapeIndex } from '../polygons/mapshaper-tile-shape-index';
import { buildPolygonMosaic } from '../polygons/mapshaper-polygon-mosaic';
import { IdTestIndex } from '../indexing/mapshaper-id-test-index';
import { ArcLookupIndex } from '../indexing/mapshaper-id-lookup-index';
import { PolygonTiler } from '../polygons/mapshaper-polygon-tiler';
import { error, stop } from '../utils/mapshaper-logging';
import { profileStart, profileEnd } from '../utils/mapshaper-profile';
import { forEachSegmentInPath } from '../paths/mapshaper-path-utils';
import geom from '../geom/mapshaper-geom';

export function MosaicIndex(lyr, nodes, optsArg) {
  profileStart('MosaicIndex.ctor');
  var opts = optsArg || {};
  var shapes = lyr.shapes;
  profileStart('mi.buildPolygonMosaic');
  var mosaic = buildPolygonMosaic(nodes).mosaic;
  profileEnd('mi.buildPolygonMosaic');
  profileStart('mi.ShapeArcIndex');
  var arcTileIndex = new ShapeArcIndex(mosaic, nodes.arcs);
  profileEnd('mi.ShapeArcIndex');
  var fetchedTileIndex = new IdTestIndex(mosaic.length, true);
  var tileShapeIndex = new TileShapeIndex(mosaic, opts);
  profileStart('mi.PolygonTiler.ctor');
  var shapeTiler = new PolygonTiler(mosaic, arcTileIndex, nodes, opts);
  profileEnd('mi.PolygonTiler.ctor');
  var weightFunction = null;
  if (!opts.simple && opts.flat) {
    weightFunction = getOverlapPriorityFunction(lyr.shapes, nodes.arcs, opts.overlap_rule);
  }
  this.mosaic = mosaic;
  this.nodes = nodes; // kludge
  this.getSourceIdsByTileId = tileShapeIndex.getShapeIdsByTileId; // expose for -mosaic command
  this.getTileIdsByShapeId = tileShapeIndex.getTileIdsByShapeId;

  profileStart('mi.assignTilesToShapes');
  shapes.forEach(function(shp, shapeId) {
    var tileIds = shapeTiler.getTilesInShape(shp, shapeId);
    tileShapeIndex.indexTileIdsByShapeId(shapeId, tileIds, weightFunction);
  });
  profileEnd('mi.assignTilesToShapes');

  if (opts.flat) {
    profileStart('mi.tileShapeIndex.flatten');
    tileShapeIndex.flatten();
    profileEnd('mi.tileShapeIndex.flatten');
  }
  profileEnd('MosaicIndex.ctor');

  // fill gaps
  // (assumes that tiles have been allocated to shapes and mosaic has been flattened)
  this.removeGaps = function(filter) {
    if (!opts.flat) {
      error('MosaicIndex#removeGaps() should only be called with a flat mosaic');
    }
    var remainingIds = tileShapeIndex.getUnusedTileIds();
    var filledIds = remainingIds.filter(function(tileId) {
      var tile = mosaic[tileId];
      return filter(tile[0]); // test tile ring, ignoring any holes (does this matter?)
    });
    filledIds.forEach(assignTileToAdjacentShape);
    return {
      removed: filledIds.length,
      remaining: remainingIds.length - filledIds.length
    };
  };

  this.getUnusedTiles = function() {
    return tileShapeIndex.getUnusedTileIds().map(tileIdToTile);
  };

  this.getTilesByShapeIds = function(shapeIds) {
    return getTileIdsByShapeIds(shapeIds).map(tileIdToTile);
  };

  // Experimental: assign tiles to a shape by winding-number fill instead of
  // boundary flood. The shape's rings are treated as a set of directed edges;
  // a tile belongs to the shape if the winding number of its interior is
  // nonzero. Unlike the boundary flood (PolygonTiler), this resolves
  // self-overlapping construction rings the way a true polygon union does:
  // overlapping bands accumulate winding (kept) and concave "dip-to-vertex"
  // pockets cancel against the bands that cover them (dropped). This makes the
  // post-hoc band-coverage audit and artifact-hole filter unnecessary.
  //
  // Implementation: flood integer winding deltas across the planar mosaic.
  // Crossing a mosaic arc changes the winding by the net signed number of the
  // shape's ring-darts on that arc (an integer, so no FP drift). One direct
  // ray-cast establishes the absolute winding of a seed tile; the flood is
  // bounded to the shape's bounding box (the buffer cannot extend past its
  // own rings' bbox), so the cost is proportional to the shape's footprint
  // rather than the whole mosaic.
  var windStamp = new Uint32Array(mosaic.length);
  var windVal = new Int32Array(mosaic.length);
  var tileBounds = [];
  var windCounter = 0;

  function getTileBounds(tileId) {
    var b = tileBounds[tileId];
    if (!b) {
      b = tileBounds[tileId] = nodes.arcs.getSimpleShapeBounds(mosaic[tileId][0]);
    }
    return b;
  }

  // Tiles of a one-sided buffer shape, selected by winding number. The buffer
  // rings are constructed one-sided (offset curve + end caps + the source path
  // as the inner edge), so the nonzero-winding region is the buffered side; no
  // wrong-side removal pass is applied (see makePolylineBuffer). Residual
  // wrong-side lobes on self-approaching paths come from the offset
  // construction and are left in place -- removing them at the tile level
  // (topological flood or per-tile geometric vote) was measured to add more
  // artifacts (coverage dents) than it removed.
  this.getWindingTilesByShapeId = function(shapeId, fillGaps) {
    var shp = shapes[shapeId];
    if (!shp || !shp.length) return [];
    var i, r, ring, d, fwd;
    // flux: forward arc id -> net signed traversal count by the shape's rings
    var flux = new Map();
    var allArcs = [];
    for (r = 0; r < shp.length; r++) {
      ring = shp[r];
      for (i = 0; i < ring.length; i++) {
        d = ring[i];
        fwd = d >= 0 ? d : ~d;
        flux.set(fwd, (flux.get(fwd) || 0) + (d >= 0 ? 1 : -1));
        allArcs.push(d);
      }
    }
    var sb = nodes.arcs.getSimpleShapeBounds(allArcs);
    var stamp = ++windCounter;
    var ids = [];
    // A shape's footprint can span several disconnected mosaic components
    // (a multi-part feature, or one whose buffer pinches apart), so seed a
    // flood from every ring and skip rings whose component is already done.
    for (r = 0; r < shp.length; r++) {
      if (!shp[r].length) continue;
      var seedTile = arcTileIndex.getShapeIdByArcId(shp[r][0]);
      if (seedTile < 0 || windStamp[seedTile] === stamp) continue;
      floodComponent(seedTile, flux, sb, stamp, ids, fillGaps);
    }
    return ids.map(tileIdToTile);
  };

  // Build a one-sided buffer by splitting a two-sided buffer with its source
  // path and keeping the front side. @shapeId is a two-sided buffer shape
  // (its boundary-flood footprint tiles); @pathParts are the source path's
  // directed arcs grouped by ring/part, spliced into the same topology (open
  // parts extended past their ends so the path divides the caps too). Because
  // the path arcs are tile boundaries, every footprint tile lies wholly on one
  // side of the path, so each tile is classified directly by the user's
  // complement principle: a point belongs to the left buffer iff, at its
  // nearest foot on the path, it is on the left. @frontLeft true keeps tiles
  // left of the path's traversal direction (right otherwise). This is a local,
  // per-tile geometric test -- no flood, no connectivity -- so it cannot leak
  // a back-side lobe to the front through a fold (the failure mode of a
  // topological flood). Cost is O(footprint tiles x path segments) per shape.
  this.getFrontTilesByShapeId = function(shapeId, pathParts, frontLeft) {
    var ids = getTileIdsByShapeIds([shapeId]);
    if (!pathParts || !pathParts.length) return ids.map(tileIdToTile);
    var segs = collectPathSegments(pathParts);
    if (!segs.n) return ids.map(tileIdToTile);
    var pathAbs = buildPathAbsSet(pathParts);
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var tile = mosaic[ids[i]];
      // A tile can straddle the medial axis (its nearest path segment, hence
      // its complement-principle side, varies across the tile) even though it
      // is wholly on one side of the path. Sample every non-path boundary
      // midpoint and keep the tile if its front samples are at least its back
      // samples -- a perimeter-weighted majority that keeps tiles that are
      // mostly front (avoiding dents) and drops tiles that are mostly back
      // (removing fold lobes). Tiles with no classifiable boundary are kept.
      var vote = voteTileFrontSide(tile, pathAbs, segs, frontLeft);
      if (vote >= 0) out.push(tile);
    }
    // keep everything rather than erase the buffer if nothing classified front
    return (out.length ? out : ids.map(tileIdToTile));
  };

  // Flatten a path's directed arcs (grouped by part) into segment-endpoint
  // arrays for nearest-foot tests, plus a uniform grid index of the segments
  // (so each query scans only nearby segments, not the whole path). Segments
  // follow the path's traversal direction, so the left/right sign below is
  // relative to that direction.
  function collectPathSegments(pathParts) {
    var ax = [], ay = [], bx = [], by = [];
    for (var p = 0; p < pathParts.length; p++) {
      forEachSegmentInPath(pathParts[p], nodes.arcs, function(a, b, xx, yy) {
        ax.push(xx[a]); ay.push(yy[a]); bx.push(xx[b]); by.push(yy[b]);
      });
    }
    var segs = {ax: ax, ay: ay, bx: bx, by: by, n: ax.length};
    segs.idx = buildSegmentGrid(segs);
    return segs;
  }

  function buildSegmentGrid(segs) {
    var n = segs.n;
    if (!n) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i;
    for (i = 0; i < n; i++) {
      if (segs.ax[i] < x0) x0 = segs.ax[i];
      if (segs.bx[i] < x0) x0 = segs.bx[i];
      if (segs.ax[i] > x1) x1 = segs.ax[i];
      if (segs.bx[i] > x1) x1 = segs.bx[i];
      if (segs.ay[i] < y0) y0 = segs.ay[i];
      if (segs.by[i] < y0) y0 = segs.by[i];
      if (segs.ay[i] > y1) y1 = segs.ay[i];
      if (segs.by[i] > y1) y1 = segs.by[i];
    }
    var k = Math.max(1, Math.round(Math.sqrt(n)));
    var cw = (x1 - x0) / k || 1, ch = (y1 - y0) / k || 1;
    var cells = new Array(k * k);
    for (i = 0; i < n; i++) {
      var c0 = clampInt((Math.min(segs.ax[i], segs.bx[i]) - x0) / cw, k);
      var c1 = clampInt((Math.max(segs.ax[i], segs.bx[i]) - x0) / cw, k);
      var r0 = clampInt((Math.min(segs.ay[i], segs.by[i]) - y0) / ch, k);
      var r1 = clampInt((Math.max(segs.ay[i], segs.by[i]) - y0) / ch, k);
      for (var cy = r0; cy <= r1; cy++) {
        for (var cx = c0; cx <= c1; cx++) {
          var ci = cy * k + cx;
          (cells[ci] || (cells[ci] = [])).push(i);
        }
      }
    }
    return {x0: x0, y0: y0, cw: cw, ch: ch, k: k, cells: cells,
      minCell: Math.min(cw, ch)};
  }

  function clampInt(v, k) {
    v = Math.floor(v);
    return v < 0 ? 0 : (v >= k ? k - 1 : v);
  }

  function buildPathAbsSet(pathParts) {
    var s = new Set();
    for (var p = 0; p < pathParts.length; p++) {
      var part = pathParts[p];
      for (var i = 0; i < part.length; i++) {
        s.add(part[i] < 0 ? ~part[i] : part[i]);
      }
    }
    return s;
  }

  // Perimeter-weighted front/back vote over a tile's non-path boundary
  // segments (each lies wholly on the tile's side of the path). Returns
  // front-count minus back-count; >= 0 means keep (ties favor coverage). A
  // tile with no classifiable boundary returns 0 (kept).
  function voteTileFrontSide(tile, pathAbs, segs, frontLeft) {
    var net = 0;
    for (var r = 0; r < tile.length; r++) {
      var ring = tile[r];
      for (var k = 0; k < ring.length; k++) {
        var d = ring[k];
        if (pathAbs.has(d < 0 ? ~d : d)) continue;
        // one nearest-foot query per boundary arc (its middle segment's
        // midpoint), weighted by the arc's segment count -- a perimeter-
        // weighted vote at a fraction of the per-segment cost. Boundary arcs
        // that parallel the path are uniformly one side; join arcs are short.
        var mids = [];
        forEachSegmentInPath([d], nodes.arcs, function(a, b, xx, yy) {
          mids.push((xx[a] + xx[b]) / 2, (yy[a] + yy[b]) / 2);
        });
        var nMid = mids.length / 2;
        if (!nMid) continue;
        // sample up to ~4 points evenly along the arc; each sample carries the
        // weight (segment count) of the stretch it represents, so a long
        // boundary that curves across the medial axis votes piecewise.
        var step = Math.max(1, Math.ceil(nMid / 4));
        for (var s = 0; s < nMid; s += step) {
          var w = Math.min(step, nMid - s);
          net += (pointIsFrontOfPath(mids[2 * s], mids[2 * s + 1], segs,
            frontLeft) ? 1 : -1) * w;
        }
      }
    }
    return net;
  }

  // Nearest path segment to (px,py): returns {d, cross} where d is the squared
  // distance to the nearest segment and cross is the cross product of that
  // segment's direction with (P - segStart) -- left (>0) vs right (<0) of the
  // traversal direction. Uses the grid, expanding cell rings until no closer
  // segment can exist.
  function nearestPathFoot(px, py, segs) {
    var best = {d: Infinity, cross: 0};
    var idx = segs.idx;
    if (!idx) {
      scanSegmentRange(px, py, segs, 0, segs.n, best);
    } else {
      var cx = clampInt((px - idx.x0) / idx.cw, idx.k);
      var cy = clampInt((py - idx.y0) / idx.ch, idx.k);
      for (var ring = 0; ring <= 2 * idx.k; ring++) {
        scanGridRing(px, py, segs, idx, cx, cy, ring, best);
        // ring r's cells start at least (r-1) cells away; if that exceeds the
        // best distance found, no closer segment remains
        if (best.d < Infinity) {
          var minNext = (ring) * idx.minCell;
          if (minNext * minNext > best.d) break;
        }
      }
      if (best.d === Infinity) scanSegmentRange(px, py, segs, 0, segs.n, best);
    }
    return best;
  }

  // Is (px,py) on the front side of the path? (sign of the nearest segment's
  // cross product, per @frontLeft)
  function pointIsFrontOfPath(px, py, segs, frontLeft) {
    var best = nearestPathFoot(px, py, segs);
    return frontLeft ? best.cross > 0 : best.cross < 0;
  }

  function scanGridRing(px, py, segs, idx, cx, cy, ring, best) {
    var k = idx.k, yy, xx, cell, j;
    for (yy = cy - ring; yy <= cy + ring; yy++) {
      if (yy < 0 || yy >= k) continue;
      for (xx = cx - ring; xx <= cx + ring; xx++) {
        if (xx < 0 || xx >= k) continue;
        if (Math.max(Math.abs(xx - cx), Math.abs(yy - cy)) !== ring) continue;
        cell = idx.cells[yy * k + xx];
        if (!cell) continue;
        for (j = 0; j < cell.length; j++) {
          scanSegmentRange(px, py, segs, cell[j], cell[j] + 1, best);
        }
      }
    }
  }

  function scanSegmentRange(px, py, segs, lo, hi, best) {
    for (var i = lo; i < hi; i++) {
      var dx = segs.bx[i] - segs.ax[i], dy = segs.by[i] - segs.ay[i];
      var l2 = dx * dx + dy * dy;
      var t = l2 > 0 ? ((px - segs.ax[i]) * dx + (py - segs.ay[i]) * dy) / l2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      var fx = segs.ax[i] + t * dx, fy = segs.ay[i] + t * dy;
      var ex = px - fx, ey = py - fy, d = ex * ex + ey * ey;
      if (d < best.d) {
        best.d = d;
        best.cross = dx * (py - segs.ay[i]) - dy * (px - segs.ax[i]);
      }
    }
  }

  // Flood one connected mosaic component containing @seedTile, assigning each
  // tile a winding number for the current shape. Conservative integer deltas
  // give the winding up to an unknown offset; the offset is fixed by anchoring
  // any neighbor known to be outside the buffer (the true exterior, or a tile
  // entirely outside the shape bbox) at winding 0. Nonzero tiles are pushed to
  // @ids. The flood is bounded to the shape bbox for speed.
  function floodComponent(seedTile, flux, sb, stamp, ids, fillGaps) {
    windVal[seedTile] = 0;
    windStamp[seedTile] = stamp;
    var stack = [seedTile];
    var visited = [seedTile];
    var C = null;
    // Node keys of arcs on the buffer's true outer edge (nb < 0). The exterior
    // is not a mosaic tile, so a pinched fold-back wedge is detected by sharing
    // one of these nodes (see fillPinchedGaps).
    var outerKeys = fillGaps ? {} : null;
    var cur, ctile, cw, pp, ring2, kk, d2, nb, fwd2, nbb, delta, i;
    while (stack.length) {
      cur = stack.pop();
      ctile = mosaic[cur];
      cw = windVal[cur];
      for (pp = 0; pp < ctile.length; pp++) {
        ring2 = ctile[pp];
        for (kk = 0; kk < ring2.length; kk++) {
          d2 = ring2[kk];
          nb = arcTileIndex.getShapeIdByArcId(~d2);
          if (nb >= 0 && windStamp[nb] === stamp) continue;
          fwd2 = d2 >= 0 ? d2 : ~d2;
          delta = (d2 >= 0 ? -1 : 1) * (flux.get(fwd2) || 0);
          if (nb >= 0) nbb = getTileBounds(nb);
          if (nb < 0 || nbb.xmax < sb.xmin || nbb.xmin > sb.xmax ||
              nbb.ymax < sb.ymin || nbb.ymin > sb.ymax) {
            if (C === null) C = -(cw + delta); // anchor: this neighbor is winding 0
            if (outerKeys && nb < 0) {
              outerKeys[arcEndpointKey(d2, 0)] = true;
              outerKeys[arcEndpointKey(d2, -1)] = true;
            }
            continue;
          }
          windVal[nb] = cw + delta;
          windStamp[nb] = stamp;
          visited.push(nb);
          stack.push(nb);
        }
      }
    }
    if (C === null) C = 0;
    for (i = 0; i < visited.length; i++) {
      if (windVal[visited[i]] + C !== 0) ids.push(visited[i]);
    }
    if (fillGaps) {
      fillPinchedGaps(visited, stamp, C, outerKeys, ids);
    }
  }

  // Reclaim winding-zero gaps that the winding rule dropped but that are not
  // really open. Where variable geodesic offset distance breaks the planar
  // self-crossing assumption, a fold-back leaves a thin winding-zero wedge that
  // is pinched to the open exterior at a single point: a shared node (arc
  // endpoint on the buffer's outer edge), NOT a shared arc. So a wedge is
  // absorbed when its winding-zero component:
  //   - borders the outer edge nowhere across an arc (it is not the open
  //     exterior or an open concavity, which the winding rule legitimately
  //     leaves out), and
  //   - shares a boundary node with the outer edge (the pinch point).
  // This is purely topological (the analogue of -clean/removeGaps); unlike an
  // area threshold it cannot fill a genuine interior hole, whose boundary nodes
  // are all interior and never coincide with the buffer's outer edge.
  function fillPinchedGaps(visited, stamp, C, outerKeys, ids) {
    if (!outerKeys) return;
    var candidates = [];
    for (var i = 0; i < visited.length; i++) {
      if (windVal[visited[i]] + C === 0) candidates.push(visited[i]);
    }
    var isGap = function(tileId) {
      return windStamp[tileId] === stamp && windVal[tileId] + C === 0;
    };
    var pinched = collectPinchedGapTiles(candidates, isGap, outerKeys);
    for (i = 0; i < pinched.length; i++) ids.push(pinched[i]);
  }

  // Group @candidates (gap-region tile ids) into arc-connected components, then
  // return the ids of components that are pinched to the buffer's outer edge: a
  // component that borders the exterior (nb < 0) nowhere across an arc, yet
  // shares a boundary node with @outerKeys (the outer-edge nodes). @isGap tells
  // whether a neighbor tile belongs to the gap region (grows the component).
  // Purely topological, so it never reclaims a genuine interior hole (whose
  // boundary nodes are all interior).
  function collectPinchedGapTiles(candidates, isGap, outerKeys) {
    var comp = {}, out = [];
    var i, t, tile, p, ring, k, d, nb, tiles, keys, arcOpen, stack;
    for (i = 0; i < candidates.length; i++) {
      if (comp[candidates[i]] !== undefined) continue;
      tiles = [candidates[i]];
      keys = [];
      arcOpen = false;
      comp[candidates[i]] = true;
      stack = [candidates[i]];
      while (stack.length) {
        t = stack.pop();
        tile = mosaic[t];
        for (p = 0; p < tile.length; p++) {
          ring = tile[p];
          for (k = 0; k < ring.length; k++) {
            d = ring[k];
            keys.push(arcEndpointKey(d, 0), arcEndpointKey(d, -1));
            nb = arcTileIndex.getShapeIdByArcId(~d);
            if (nb < 0) {
              arcOpen = true; // borders the outer edge across an arc
              continue;
            }
            if (!isGap(nb)) continue; // selected boundary of the gap
            if (comp[nb] === undefined) {
              comp[nb] = true;
              tiles.push(nb);
              stack.push(nb);
            }
          }
        }
      }
      if (!arcOpen && sharesKey(keys, outerKeys)) {
        for (k = 0; k < tiles.length; k++) out.push(tiles[k]);
      }
    }
    return out;
  }

  function arcEndpointKey(arcId, nth) {
    var v = nodes.arcs.getVertex(arcId, nth);
    return v.x + ',' + v.y;
  }

  function sharesKey(keys, set) {
    for (var i = 0; i < keys.length; i++) {
      if (set[keys[i]]) return true;
    }
    return false;
  }

  function getOverlapPriorityFunction(shapes, arcs, rule) {
    var f;
    if (!rule || rule == 'max-area') {
      f = getAreaWeightFunction(shapes, arcs, false);
    } else if (rule == 'min-area') {
      f = getAreaWeightFunction(shapes, arcs, true);
    } else if (rule == 'max-id') {
      f = function(shapeId) {
        return shapeId; };
    } else if (rule == 'min-id') {
      f = function(shapeId) { return -shapeId; };
    } else {
      stop('Unknown overlap rule:', rule);
    }
    return f;
  }

  function getAreaWeightFunction(shapes, arcs, invert) {
    var index = [];
    var sign = invert ? -1 : 1;
    return function(shpId) {
      var weight;
      if (shpId in index) {
        weight = index[shpId];
      } else {
        weight = sign * Math.abs(geom.getShapeArea(shapes[shpId], arcs));
        index[shpId] = weight;
      }
      return weight;
    };
  }

  function tileIdToTile(id, i) {
    return mosaic[id];
  }

  function assignTileToAdjacentShape(tileId) {
    var ring = mosaic[tileId][0];
    var arcs = nodes.arcs;
    var arcId, neighborShapeId, neighborTileId, arcLen;
    var shapeId = -1, maxArcLen = 0;
    for (var i=0; i<ring.length; i++) {
      arcId = ring[i];
      neighborTileId = arcTileIndex.getShapeIdByArcId(~arcId);
      if (neighborTileId < 0) continue;
      neighborShapeId = tileShapeIndex.getShapeIdByTileId(neighborTileId);
      if (neighborShapeId < 0) continue;
      arcLen = geom.getPathPerimeter([arcId], arcs);
      if (arcLen > maxArcLen) {
        shapeId = neighborShapeId;
        maxArcLen = arcLen;
      }
    }
    if (shapeId > -1) {
      tileShapeIndex.addTileToShape(shapeId, tileId);
    }
  }

  function getTileIdsByShapeIds(shapeIds) {
    var uniqIds = [];
    var tileId, tileIds, i, j;
    for (i=0; i<shapeIds.length; i++) {
      tileIds = tileShapeIndex.getTileIdsByShapeId(shapeIds[i]);
      for (j=0; j<tileIds.length; j++) {
        tileId = tileIds[j];
        // uniqify tile ids (in case the shape contains overlapping rings)
        if (fetchedTileIndex.hasId(tileId)) continue;
        fetchedTileIndex.setId(tileId);
        uniqIds.push(tileId);
      }
    }
    // clearing this index allows duplicate tile ids between calls to this function
    // (should not happen in a typical dissolve)
    fetchedTileIndex.clear();
    return uniqIds;
  }
}

// Map arc ids to shape ids, assuming perfect topology
// (an arcId maps to at most one shape)
// Supports looking up a shape id using an arc id.
export function ShapeArcIndex(shapes, arcs) {
  var n = arcs.size();
  var index = new ArcLookupIndex(n);
  var shapeId;
  shapes.forEach(onShape);

  function onShape(shp, i) {
    shapeId = i;
    shp.forEach(onPart);
  }
  function onPart(path) {
    var arcId;
    for (var i=0, n=path.length; i<n; i++) {
      arcId = path[i];
      index.setId(arcId, shapeId);
    }
  }

  // returns -1 if shape has not been indexed
  this.getShapeIdByArcId = function(arcId) {
    return index.getId(arcId);
  };
}
