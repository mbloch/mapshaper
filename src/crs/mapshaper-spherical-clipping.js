import {
  isClippedAzimuthalProjection,
  getDefaultClipAngle,
  isClippedCylindricalProjection,
  getDefaultClipBBox,
} from '../crs/mapshaper-proj-info';
import {
  getSemiMinorAxis
} from '../crs/mapshaper-proj-utils';
import { isLatLngCRS, getDatasetCRS } from '../crs/mapshaper-projections';
import { getCircleGeoJSON } from '../buffer/mapshaper-point-buffer';
import { getPreciseGeodeticSegmentFunction } from '../geom/mapshaper-geodesic';
import { clipLayersByGeoJSON } from '../clipping/mapshaper-clip-utils';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { convertBboxToGeoJSON } from '../commands/mapshaper-rectangle';
import { error } from '../utils/mapshaper-logging';

export function preProjectionClip(dataset, src, dest, opts) {
  var clipped = false;
  if (!isLatLngCRS(src) || opts.no_clip) return false;
  if (isClippedAzimuthalProjection(dest) || opts.clip_angle) {
    clipped = clipToCircle(dataset, src, dest, opts);
  }
  if (isClippedCylindricalProjection(dest) || opts.clip_bbox) {
    clipToRectangle(dataset, dest, opts);
    clipped = true;
  }
  if (clipped) {
    // remove arcs outside the clip area, so they don't get projected
    dissolveArcs(dataset);
  }
  return clipped;
}

export function getProjectionOutline(src, dest, opts) {
  if (!isClippedAzimuthalProjection(dest)) return null;
  return getClipShapeGeoJSON(src, dest, opts);
}

function getClipShapeGeoJSON(src, dest, opts) {
  var angle = opts.clip_angle || dest.clip_angle || getDefaultClipAngle(dest);
  if (!angle) return null;
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
  // TODO: don't clip if dataset fits within the bbox
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
  // Using semi-minor axis radius, to prevent overflowing projection bounds
  // when clipping up to the edge of the projectable area
  // TODO: improve (this just gives a safe minimum distance, not the best distance)
  // TODO: modify point buffer function to use angle + ellipsoidal geometry
  return angle * Math.PI / 180 * getSemiMinorAxis(P);
}
