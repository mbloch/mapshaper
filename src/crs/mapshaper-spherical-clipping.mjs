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
  cutPaths = topology.seams
    .filter(function(o) { return o.type == 'cut'; })
    .reduce(function(memo, o) {
      return memo.concat(getCutSeamPaths(o.coordinates));
    }, []);
  if (cutPaths.length === 0) return false;
  geojson = getCutMaskGeoJSON(cutPaths);
  if (geojson.features.length === 0) return false;
  clip = importGeoJSON(geojson);
  clipLayersInPlace(pathLayers, clip, dataset, 'erase', getInternalClipOpts());
  return true;
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
function getCutMaskGeoJSON(paths) {
  var e = 1e-8;
  var features = paths.map(function(coords) {
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
    left.push([coords[i][0] + nx, coords[i][1] + ny]);
    right.push([coords[i][0] - nx, coords[i][1] - ny]);
  }
  var ring = left.concat(right.reverse());
  if (ring.length > 0) ring.push(ring[0].concat());
  return ring;
}

function getInternalClipOpts() {
  return {no_cleanup: true, no_warn: true};
}
