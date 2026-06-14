import {
  dissolveBufferDataset2,
  getBufferDistanceFunction
} from '../buffer/mapshaper-buffer-common';
import { getDatasetCRS, isLatLngCRS } from '../crs/mapshaper-projections';
import { importGeoJSON } from '../geojson/geojson-import';
import { getPolylineBufferMaker } from '../buffer/mapshaper-path-buffer-v4';
import { splitAntimeridianBufferDataset } from '../buffer/mapshaper-polyline-buffer';
import { R, R2D, pointSegDistSq2 } from '../geom/mapshaper-basic-geom';
import { getPointToShapeDistance } from '../geom/mapshaper-path-geom';
import { getShapeArea } from '../geom/mapshaper-polygon-geom';
import { exportPathData } from '../paths/mapshaper-path-export';
import { reversePath } from '../paths/mapshaper-path-utils';
import { getRingIntersector } from '../paths/mapshaper-pathfinder';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { fixNestingErrors, groupPolygonRings } from '../polygons/mapshaper-ring-nesting';
import { PathIndex } from '../paths/mapshaper-path-index';
import { MosaicIndex } from '../polygons/mapshaper-mosaic-index';
import { getArcClassifier } from '../topology/mapshaper-arc-classifier';
import { stop, warn } from '../utils/mapshaper-logging';

export function makePolygonBuffer(lyr, dataset, opts) {
  var spherical = isLatLngCRS(getDatasetCRS(dataset));
  // The debug-offset/debug-winding/debug-mosaic visualizations are implemented
  // only for line buffers. They have no handling in the polygon pipeline; left
  // unstripped they leak into the per-shape dissolve and produce malformed
  // output, so drop them and warn rather than silently mislead.
  if (opts.debug_offset || opts.debug_winding || opts.debug_mosaic) {
    warn('debug-offset/debug-winding/debug-mosaic are not implemented for polygon buffers; ignoring');
    opts = Object.assign({}, opts, {
      debug_offset: false,
      debug_winding: false,
      debug_mosaic: false
    });
  }
  var output = makePolygonBufferGeoJSON(lyr, dataset, opts);
  var dataset2 = importGeoJSON(output.geojson, {type: 'polygon'});
  if (spherical) {
    splitAntimeridianBufferDataset(dataset2);
    if (output.dissolveAfterSplit) {
      dissolveBufferDataset2(dataset2, opts);
    }
  }
  return dataset2;
}

function makePolygonBufferGeoJSON(lyr, dataset, opts) {
  var distanceFn = getBufferDistanceFunction(lyr, dataset, opts);
  var useTopologicalMode = !!opts.topological;
  var uniqueArcTest = useTopologicalMode ? getUniqueArcTest(lyr, dataset.arcs) : null;
  var hasPositiveDistance = false;
  var hasNegativeDistance = false;
  if (useTopologicalMode) {
    // The topological pipeline selects mosaic tiles by source membership
    // (boundary flood), which cannot resolve the self-overlapping winding-fill
    // ring. So each feature's winding-fill offset rings are pre-dissolved into a
    // clean (non-self-overlapping) polygon before they enter the shared mosaic;
    // the construction speedup (loop removal cutting per-feature self-
    // intersections) is preserved, and the mosaic is unchanged.
    return makeTopologicalPolygonBufferGeoJSON(lyr, dataset, opts, distanceFn,
      uniqueArcTest, getPolygonRingBufferMaker(dataset, opts, 'left', true));
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
    return makePositivePolygonBufferGeometry(shape, distance, dataset, opts,
      leftBufferMaker);
  });
  return {
    geojson: {
      type: 'GeometryCollection',
      geometries: geometries
    },
    dissolveAfterSplit: hasPositiveDistance && !hasNegativeDistance
  };
}

function getPolygonRingBufferMaker(dataset, opts, side, winding) {
  // The sector-band escape hatch forces the older non-winding construction even
  // for callers that request winding-fill (see the 'sector-band' option).
  var useWinding = !!winding && !opts.sector_band;
  var makerOpts = Object.assign({}, opts, {
    left: side == 'left',
    right: side == 'right',
    winding_fill: useWinding,
    // Enable overshoot-loop removal on the single winding-fill offset ring.
    // Scoped to closed polygon rings: an open one-sided line buffer relies on
    // the band-coverage audit (skipped under winding_fill) for concave-join
    // dents, which loop removal would collapse.
    buffer_ring_loops: useWinding
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
    uniqueArcTest, bufferMaker) {
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

  shapes.forEach(function(shape, i) {
    var distance = distances[i];
    var pathData, bufferCoords;
    if (!distance || !shape) return;
    hasPositiveDistance = true;
    pathData = getPolygonBufferPathData(shape, uniqueArcTest);
    bufferCoords = getBufferMultiPolygonCoords(pathData.paths, distance, bufferMaker);
    // Resolve the winding-fill rings' self-overlaps into a clean polygon (the
    // mosaic's boundary-flood membership cannot), so this feature enters the
    // shared mosaic as an ordinary polygon. The sector-band fallback emits
    // boundary-flood-resolvable bands, so it feeds the mosaic directly (as the
    // topological pipeline did before the winding-fill construction).
    if (!opts.sector_band) {
      bufferCoords = dissolveOffsetRingsToCoords(bufferCoords, opts);
    }
    if (bufferCoords.length > 0) {
      bufferIds[i] = tmpGeometries.length;
      tmpGeometries.push({
        type: 'MultiPolygon',
        coordinates: bufferCoords
      });
    }
  });

  if (!hasPositiveDistance || tmpGeometries.length === 0) {
    geometries = shapes.map(function() { return null; });
  } else {
    tmpDataset = importGeoJSON({
      type: 'GeometryCollection',
      geometries: tmpGeometries
    }, {type: 'polygon'});
    geometries = makeTopologicalPolygonBufferGeometries(shapes, distances,
      sourceIds, bufferIds, tmpDataset, dataset.arcs);
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
    bufferIds, tmpDataset, sourceArcs) {
  var tmpLyr = tmpDataset.layers[0];
  var nodes = addIntersectionCuts(tmpDataset, {rebuild_topology: true});
  var mosaicIndex = new MosaicIndex(tmpLyr, nodes, {flat: false, no_holes: false});
  var pathfind = getRingIntersector(mosaicIndex.nodes);
  var sourceIdIndex = getIdLookup(sourceIds);
  var bufferIdIndex = getIdToFeatureIdLookup(bufferIds);
  var sourceAreas = getSourceShapeAreas(shapes, sourceArcs);
  return shapes.map(function(shape, i) {
    var distance = distances[i];
    var tileIds, geom;
    if (!distance || !shape) return null;
    tileIds = getTopologicalBufferTileIds(sourceIds[i], bufferIds[i],
      i, mosaicIndex, sourceIdIndex, bufferIdIndex, sourceAreas);
    geom = getTileIdsGeometry(tileIds, mosaicIndex, pathfind);
    return removePositiveBufferArtifactHoles(geom, shape, sourceArcs, distance);
  });
}

function getTopologicalBufferTileIds(sourceId, bufferId, featureId, mosaicIndex,
    sourceIdIndex, bufferIdIndex, sourceAreas) {
  var ids = [];
  var index = [];
  addTileIds(ids, index, mosaicIndex.getTileIdsByShapeId(sourceId));
  if (bufferId >= 0) {
    addTileIds(ids, index, mosaicIndex.getTileIdsByShapeId(bufferId).filter(function(tileId) {
      return !tileHasSourcePolygon(tileId, mosaicIndex, sourceIdIndex) &&
        getBufferTileOwnerId(tileId, mosaicIndex, bufferIdIndex, sourceAreas) == featureId;
    }));
  }
  return ids;
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

function getBufferTileOwnerId(tileId, mosaicIndex, bufferIdIndex, sourceAreas) {
  var ownerId = -1;
  var ownerArea = -Infinity;
  mosaicIndex.getSourceIdsByTileId(tileId).forEach(function(shapeId) {
    var featureId = bufferIdIndex[shapeId];
    var area;
    if (featureId >= 0) {
      area = sourceAreas[featureId];
      if (area > ownerArea || area == ownerArea && featureId < ownerId) {
        ownerId = featureId;
        ownerArea = area;
      }
    }
  });
  return ownerId;
}

function getSourceShapeAreas(shapes, arcs) {
  return shapes.map(function(shape) {
    return Math.abs(getShapeArea(shape, arcs));
  });
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
  // the sector-band fallback emits overlapping bands that a boundary flood
  // resolves instead (its maker leaves winding_fill off to match).
  dissolveBufferDataset2(bufferDataset,
    Object.assign({}, opts, {winding_fill: !opts.sector_band}));
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

function removePositiveBufferArtifactHoles(geom, shape, arcs, distance) {
  if (!geom) return null;
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
      buildShapeSegmentIndex(sourceHoles.map(function(h) {return h[0];}), arcs) : null
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
    return Math.abs(getGeoJSONRingArea(ring)) > minHoleArea &&
      !positiveBufferHoleIsArtifact(ring, ctx);
  }));
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

function getPositiveHoleArtifactAreaThreshold(distance, arcs) {
  var d = getCoordinateDistance(distance, arcs);
  return d * d;
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
function dissolveOffsetRingsToCoords(coords, opts) {
  if (!coords || coords.length === 0) return [];
  var dataset = getBufferDataset(coords);
  if (!dataset.arcs) return [];
  dissolveBufferDataset2(dataset, Object.assign({}, opts, {winding_fill: true}));
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
