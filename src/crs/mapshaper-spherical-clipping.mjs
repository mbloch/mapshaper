import { isLatLngCRS, getDatasetCRS } from '../crs/mapshaper-projections';
import { clipLayersInPlace } from '../commands/mapshaper-clip-erase';
import { getClippingDataset, getClampBBox } from '../crs/mapshaper-proj-extents';
import { isRotatedNormalProjection } from '../crs/mapshaper-proj-info';
import { layerHasPaths, getLayerBounds, layerHasGeometry } from '../dataset/mapshaper-layer-utils';
import { getAntimeridian } from '../geom/mapshaper-latlon';
import { importGeoJSON } from '../geojson/geojson-import';
import { bboxToPolygon } from '../commands/mapshaper-rectangle';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { forEachSegmentInShape } from '../paths/mapshaper-path-utils';
import { transformPoints } from '../dataset/mapshaper-dataset-utils';
import utils from '../utils/mapshaper-utils';
import { testBoundsInPolygon } from '../geom/mapshaper-polygon-geom';
import { getProjectionTopology } from './mapshaper-projection-topology';
import { densifyPathByInterval } from './mapshaper-densify';
import { editArcs } from '../paths/mapshaper-arc-editor';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { dissolvePolygonLayer2 } from '../dissolve/mapshaper-polygon-dissolve2';

export function preProjectionClip(dataset, src, dest, opts) {
  if (!isLatLngCRS(src) || opts.no_clip) return false;
  // rotated normal-aspect projections can generally have a thin slice removed
  // from the rotated antimeridian, instead of clipping them
  var cut = insertPreProjectionCuts(dataset, src, dest);
  cut = insertProjectionTopologyCuts(dataset, dest) || cut;
  var clipped = false;
  var clipData;
  // experimental -- we can probably get away with just clamping some CRSs that
  // have a slightly restricted coord range (e.g. Mercator), instead of doing
  // a clip (more expensive)
  var clampBox = getClampBBox(dest);
  if (clampBox) {
    clampDataset(dataset, clampBox);
  } else {
    clipData = getClippingDataset(src, dest, opts);
  }
  // clip data to projection limits (some projections), if content exceeds the limit
  //
  if (clipData) {
    clipped = clipLayersIfNeeded(dataset, clipData);
  }
  return cut || clipped;
}

function clipLayersIfNeeded(dataset, clipData) {
  // Avoid clipping layers that are fully enclosed within the projectable
  // coordinate space (represented by a dataset containing a single
  // polygon layer, @clipData). This avoids performing unnecessary intersection
  // tests on each line segment.
  var layers = dataset.layers.filter(function(lyr) {
    return layerHasGeometry(lyr) && !layerIsFullyEnclosed(lyr, dataset, clipData);
  });
  if (layers.length > 0) {
    clipLayersInPlace(layers, clipData, dataset, 'clip', getInternalClipOpts());
    return true;
  }
  return false;
}

// @clipData: a dataset containing a polygon layer
function layerIsFullyEnclosed(lyr, dataset, clipData) {
  // This test uses the layer's bounding box to represent the extent of the
  // layer, and can produce false negatives.
  var dataBounds = getLayerBounds(lyr, dataset.arcs);
  var enclosed = false;
  clipData.layers[0].shapes.forEach(function(shp, i) {
    enclosed = enclosed || testBoundsInPolygon(dataBounds, shp, clipData.arcs);
  });
  return enclosed;
}


export function insertPreProjectionCuts(dataset, src, dest) {
  var antimeridian = getAntimeridian(dest.lam0 * 180 / Math.PI);
  // currently only supports adding a single vertical cut to earth axis-aligned
  // map projections centered on a non-zero longitude.
  // TODO: need a more sophisticated kind of cutting to handle other cases
  if (dataset.arcs && isRotatedNormalProjection(dest) && datasetCrossesLon(dataset, antimeridian)) {
    insertVerticalCut(dataset, antimeridian);
    dissolveArcs(dataset);
    return true;
  }
  return false;
}

export function insertProjectionTopologyCuts(dataset, dest) {
  var topology = getProjectionTopology(dest);
  var pathLayers = dataset.layers.filter(layerHasPaths);
  var cutPaths, geojson, clip;
  if (!topology || pathLayers.length === 0) return false;
  insertProjectionTopologyVertices(dataset, topology);
  cutPaths = topology.seams
    .filter(function(o) { return o.type == 'cut'; })
    .reduce(function(memo, o) {
      if (o.paths) return memo.concat(o.paths);
      return memo.concat(getCutSeamPaths(o.coordinates));
    }, []);
  if (cutPaths.length === 0) return false;
  geojson = getCutMaskGeoJSON(cutPaths);
  if (geojson.features.length === 0) return false;
  clip = importGeoJSON(geojson);
  if (topology.findRegion) {
    // Polyhedral cut masks meet and overlap at facet vertices. Union them before
    // clipping so overlapping source polygons are not interpreted as holes.
    addIntersectionCuts(clip, {quiet: true});
    clip.layers[0] = dissolvePolygonLayer2(clip.layers[0], clip, {quiet: true});
  }
  clipLayersInPlace(pathLayers, clip, dataset, 'erase', getInternalClipOpts());
  return true;
}

// Add a vertex wherever a path changes projection regions. This preserves a
// bend at attached polyhedral edges without opening a gap; cut edges are
// subsequently disconnected by the narrow seam masks below.
function insertProjectionTopologyVertices(dataset, topology) {
  if (!dataset.arcs || !topology.findRegion) return;
  var findRegion = topology.findTransitionRegion || topology.findRegion;
  editArcs(dataset.arcs, function(append, x, y, prevX, prevY, i) {
    if (i > 0) {
      findRegionTransitions(prevX, prevY, x, y, findRegion).forEach(append);
    }
    append([x, y]);
  });
}

function findRegionTransitions(ax, ay, bx, by, findRegion) {
  var interval = 0.5;
  var n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) / interval));
  var points = [];
  var t0 = 0;
  var region0 = findRegion(ax, ay);
  for (var i = 1; i <= n; i++) {
    var t1 = i / n;
    var x1 = ax + (bx - ax) * t1;
    var y1 = ay + (by - ay) * t1;
    var region1 = findRegion(x1, y1);
    if (region0 != region1 && region0 >= 0 && region1 >= 0) {
      var t = findRegionBoundary(ax, ay, bx, by, t0, region0, t1, findRegion);
      var p = [ax + (bx - ax) * t, ay + (by - ay) * t];
      if (!points.length || Math.abs(t - points[points.length - 1].t) > 1e-10) {
        p.t = t;
        points.push(p);
      }
    }
    t0 = t1;
    region0 = region1;
  }
  return points;
}

function findRegionBoundary(ax, ay, bx, by, ta, regionA, tb, findRegion) {
  for (var i = 0; i < 45; i++) {
    var tm = (ta + tb) / 2;
    var regionM = findRegion(ax + (bx - ax) * tm, ay + (by - ay) * tm);
    if (regionM == regionA) {
      ta = tm;
    } else {
      tb = tm;
    }
  }
  return (ta + tb) / 2;
}

function clampDataset(dataset, bbox) {
  transformPoints(dataset, function(x, y) {
    return [utils.clamp(x, bbox[0], bbox[2]), utils.clamp(y, bbox[1], bbox[3])];
  });
}

function datasetCrossesLon(dataset, lon) {
  var crosses = false;
  dataset.layers.filter(layerHasPaths).forEach(function(lyr) {
    if (crosses) return;
    lyr.shapes.forEach(function(shp) {
      if (crosses || !shp) return;
      forEachSegmentInShape(shp, dataset.arcs, function(i, j, xx, yy) {
        var ax = xx[i],
            bx = xx[j];
        if (ax <= lon && bx >= lon || ax >= lon && bx <= lon) {
          crosses = true;
        }
      });
    });
  });
  return crosses;
}

function insertVerticalCut(dataset, lon) {
  var pathLayers = dataset.layers.filter(layerHasPaths);
  if (pathLayers.length === 0) return;
  var e = 1e-8;
  var bbox = [lon-e, -91, lon+e, 91];
  // densify (so cut line can curve, e.g. Cupola projection)
  var geojson = bboxToPolygon(bbox, {interval: 0.5});
  var clip = importGeoJSON(geojson);
  clipLayersInPlace(pathLayers, clip, dataset, 'erase', getInternalClipOpts());
}

// Duplicate a seam on the opposite edge of the standard longitude range.
// This is needed when a rotated seam coincides with the antimeridian.
function getCutSeamPaths(coords) {
  var paths = [coords];
  var onEdge = coords.every(function(p) {
    return Math.abs(Math.abs(p[0]) - 180) < 1e-12;
  });
  if (onEdge) {
    paths.push(coords.map(function(p) {
      return [p[0] == 180 ? -180 : 180, p[1]];
    }));
  }
  return paths;
}

// Convert seam paths to narrow polygon masks. Densification is required so
// their projected edges follow the projection instead of becoming straight
// chords between seam endpoints.
export function getCutMaskGeoJSON(paths) {
  var features = paths.map(function(coords) {
    var e = coords.mask_width || 1e-8;
    var ring = getCutMaskRing(densifyPathByInterval(coords, 0.5), e);
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [ring]
      }
    };
  }).filter(function(feature) {
    return feature.geometry.coordinates[0].length > 3;
  });
  // Give finite seams a small end cap. Without this, a path passing exactly
  // through a polyhedral vertex can touch only the boundary of several masks
  // and remain connected across an interruption.
  paths.forEach(function(coords) {
    var endpoints = [coords[0], coords[coords.length - 1]];
    endpoints.forEach(function(p) {
      var e2 = Math.max(1e-7, (coords.mask_width || 0) * 2);
      var xmin = Math.max(-180, p[0] - e2);
      var xmax = Math.min(180, p[0] + e2);
      var ymin = Math.max(-90, p[1] - e2);
      var ymax = Math.min(90, p[1] + e2);
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [xmin, ymin],
            [xmax, ymin],
            [xmax, ymax],
            [xmin, ymax],
            [xmin, ymin]
          ]]
        }
      });
    });
  });
  return {
    type: 'FeatureCollection',
    features: features
  };
}

function getCutMaskRing(coords, width) {
  var left = [];
  var right = [];
  for (var i = 0; i < coords.length; i++) {
    var a = coords[i > 0 ? i - 1 : i];
    var b = coords[i < coords.length - 1 ? i + 1 : i];
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    var nx = -dy / len * width;
    var ny = dx / len * width;
    left.push([utils.clamp(coords[i][0] + nx, -180, 180), coords[i][1] + ny]);
    right.push([utils.clamp(coords[i][0] - nx, -180, 180), coords[i][1] - ny]);
  }
  var ring = left.concat(right.reverse());
  if (ring.length > 0) ring.push(ring[0].concat());
  return ring;
}

function getInternalClipOpts() {
  return {no_cleanup: true, no_warn: true};
}
