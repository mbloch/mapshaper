import { isLatLngCRS, getDatasetCRS } from '../crs/mapshaper-projections';
import { clipLayersInPlace } from '../commands/mapshaper-clip-erase';
import { getClippingDataset, getClampBBox } from '../crs/mapshaper-proj-extents';
import { isRotatedNormalProjection } from '../crs/mapshaper-proj-info';
import { layerHasPaths, getLayerBounds, layerHasGeometry } from '../dataset/mapshaper-layer-utils';
import { getAntimeridian } from '../geom/mapshaper-latlon';
import { importGeoJSON } from '../geojson/geojson-import';
import { convertBboxToGeoJSON } from '../commands/mapshaper-rectangle';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { transformPoints } from '../dataset/mapshaper-dataset-utils';
import utils from '../utils/mapshaper-utils';
import { testBoundsInPolygon } from '../geom/mapshaper-polygon-geom';

export function preProjectionClip(dataset, src, dest, opts) {
  if (!isLatLngCRS(src) || opts.no_clip) return false;
  // rotated normal-aspect projections can generally have a thin slice removed
  // from the rotated antimeridian, instead of clipping them
  var cut = insertPreProjectionCuts(dataset, src, dest);
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
    clipLayersInPlace(layers, clipData, dataset, 'clip');
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

function clampDataset(dataset, bbox) {
  transformPoints(dataset, function(x, y) {
    return [utils.clamp(x, bbox[0], bbox[2]), utils.clamp(y, bbox[1], bbox[3])];
  });
}

function datasetCrossesLon(dataset, lon) {
  var crosses = 0;
  dataset.arcs.forEachSegment(function(i, j, xx, yy) {
    var ax = xx[i],
        bx = xx[j];
    if (ax <= lon && bx >= lon || ax >= lon && bx <= lon) crosses++;
  });
  return crosses > 0;
}

function insertVerticalCut(dataset, lon) {
  var pathLayers = dataset.layers.filter(layerHasPaths);
  if (pathLayers.length === 0) return;
  var e = 1e-8;
  var bbox = [lon-e, -91, lon+e, 91];
  // densify (so cut line can curve, e.g. Cupola projection)
  var geojson = convertBboxToGeoJSON(bbox, {interval: 0.5});
  var clip = importGeoJSON(geojson);
  clipLayersInPlace(pathLayers, clip, dataset, 'erase');
}
