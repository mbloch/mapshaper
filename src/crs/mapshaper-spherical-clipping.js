import {
  isCircleClippedProjection,
  getDefaultClipAngle,
  isClippedCylindricalProjection,
  getDefaultClipBBox,
} from '../crs/mapshaper-proj-info';
import {
  getSemiMinorAxis, getCircleRadiusFromAngle
} from '../crs/mapshaper-proj-utils';
import { isLatLngCRS, getDatasetCRS } from '../crs/mapshaper-projections';
import { getCircleGeoJSON } from '../buffer/mapshaper-point-buffer';
import { getPreciseGeodeticSegmentFunction } from '../geom/mapshaper-geodesic';
import { clipLayersByGeoJSON } from '../clipping/mapshaper-clip-utils';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { convertBboxToGeoJSON } from '../commands/mapshaper-rectangle';
import { error, verbose } from '../utils/mapshaper-logging';
import { Bounds } from '../geom/mapshaper-bounds';

export function preProjectionClip(dataset, src, dest, opts) {
  var clipped = false;
  if (!isLatLngCRS(src) || opts.no_clip) return false;
  if (isCircleClippedProjection(dest) || opts.clip_angle) {
    clipped = clipToCircle(dataset, src, dest, opts);
  }
  if (isClippedCylindricalProjection(dest) || opts.clip_bbox) {
    clipped = clipped || clipToRectangle(dataset, dest, opts);
  }
  if (clipped) {
    // remove arcs outside the clip area, so they don't get projected
    dissolveArcs(dataset);
  }
  return clipped;
}

export function getProjectionOutline(src, dest, opts) {
  if (!isCircleClippedProjection(dest)) return null;
  return getClipShapeGeoJSON(src, dest, opts);
}

function getClipShapeGeoJSON(src, dest, opts) {
  var angle = opts.clip_angle || dest.clip_angle || getDefaultClipAngle(dest);
  if (!angle) return null;
  verbose(`Using clip angle of ${ +angle.toFixed(2) } degrees`);
  var dist = getClippingRadius(src, angle);
  var cp = getProjCenter(dest);
  // kludge: attach the clipping angle to the CRS, so subsequent commands
  // (e.g. -graticule) can create an outline
  dest.clip_angle = angle;
  return getCircleGeoJSON(cp, dist, null, opts);
}

function clipToRectangle(dataset, dest, opts) {
  var bbox = opts.clip_bbox || getDefaultClipBBox(dest);
  if (!bbox) error('Missing expected clip bbox.');
  // don't clip if dataset fits within the bbox
  if (Bounds.from(bbox).contains(getDatasetBounds(dataset))) return false;
  var geojson = convertBboxToGeoJSON(bbox);
  clipLayersByGeoJSON(dataset.layers, dataset, geojson, 'clip');
  return true;
}

function clipToCircle(dataset, src, dest, opts) {
  var geojson = getClipShapeGeoJSON(src, dest, opts);
  if (!geojson) return false;
  clipLayersByGeoJSON(dataset.layers, dataset, geojson, 'clip');
  return true;
}

function getProjCenter(P) {
  var rtod = 180 / Math.PI;
  return [P.lam0 * rtod, P.phi0 * rtod];
}

// Convert a clip angle to a distance in meters
function getClippingRadius(P, angle) {
  return getCircleRadiusFromAngle(P, angle);
}
