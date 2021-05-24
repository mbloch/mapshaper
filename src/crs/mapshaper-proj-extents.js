import { convertBboxToGeoJSON } from '../commands/mapshaper-rectangle';
import { getPreciseGeodeticSegmentFunction } from '../geom/mapshaper-geodesic';
import { inList, getCrsSlug, isAxisAligned, isMeridianBounded } from '../crs/mapshaper-proj-info';
import {
  getSemiMinorAxis, getCircleRadiusFromAngle
} from '../crs/mapshaper-proj-utils';
import { Bounds } from '../geom/mapshaper-bounds';
import { getCircleGeoJSON } from '../buffer/mapshaper-point-buffer';
import { importGeoJSON } from '../geojson/geojson-import';
import { verbose, error, message } from '../utils/mapshaper-logging';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { rotateDataset } from '../commands/mapshaper-rotate';
import { projectDataset } from '../commands/mapshaper-proj';
import { polygonsToLines } from '../commands/mapshaper-lines';
import { insertPreProjectionCuts } from '../crs/mapshaper-spherical-cutting';

export function getClippingDataset(src, dest, opts) {
  var dataset;
  if (isCircleClippedProjection(dest) || opts.clip_angle) {
    dataset = getClipCircle(src, dest, opts);
  } else if (isClippedCylindricalProjection(dest) || opts.clip_bbox) {
    dataset = getClipRectangle(dest, opts);
  }
  return dataset || null;
}

// Return projected polygon extent of both clipped and unclipped projections
export function getPolygonDataset(src, dest, opts) {
  // use clipping area if projection is clipped
  var dataset = getClippingDataset(src, dest, opts);
  if (!dataset) {
    // use entire world if projection is not clipped
    dataset = getClipRectangle(dest, {clip_bbox: [-180,-90,180,90]});
  }
  projectDataset(dataset, src, dest, {no_clip: false, quiet: true});
  return dataset;
}

// Return projected outline of clipped projections
export function getOutlineDataset(src, dest, opts) {
  var dataset = getClippingDataset(src, dest, opts);
  if (dataset) {
    // project, with cutting & cleanup
    projectDataset(dataset, src, dest, {no_clip: false, quiet: true});
    dataset.layers[0].geometry_type = 'polyline';
  }
  return dataset || null;
}

function getClipRectangle(dest, opts) {
  var bbox = opts.clip_bbox || getDefaultClipBBox(dest);
  var rotation = getRotationParams(dest);
  if (!bbox) error('Missing expected clip bbox.');
  opts = Object.assign({interval: 0.5}, opts); // make sure edges can curve
  var geojson = convertBboxToGeoJSON(bbox, opts);
  var dataset = importGeoJSON(geojson);
  if (rotation) {
    rotateDataset(dataset, {rotation: rotation, invert: true});
  }
  return dataset;
}

function getClipCircle(src, dest, opts) {
  var angle = opts.clip_angle || dest.clip_angle || getDefaultClipAngle(dest);
  if (!angle) return null;
  verbose(`Using clip angle of ${ +angle.toFixed(2) } degrees`);
  var dist = getClippingRadius(src, angle);
  var cp = getProjCenter(dest);
  // kludge: attach the clipping angle to the CRS, so subsequent commands
  // (e.g. -graticule) can create an outline
  dest.clip_angle = angle;
  var geojson = getCircleGeoJSON(cp, dist, null, opts);
  return importGeoJSON(geojson);
}

export function isClippedCylindricalProjection(P) {
  // TODO: add tmerc, etmerc, ...
  return inList(P, 'merc,bertin1953');
}

export function getDefaultClipBBox(P) {
  var e = 1e-3;
  var bbox = {
    // longlat: [-180, -90, 180, 90],
    merc: [-180, -87, 180, 87],
    bertin1953: [-180 + e, -90 + e, 180 - e, 90 - e]
  }[getCrsSlug(P)];
  return bbox;
}

export function isCircleClippedProjection(P) {
  return inList(P, 'stere,sterea,ups,ortho,gnom,laea,nsper,tpers');
}

function getPerspectiveClipAngle(P) {
  var h = parseFloat(P.params.h.param);
  if (!h || h < 0) {
    return 0;
  }
  var theta = Math.acos(P.a / (P.a + h)) * 180 / Math.PI;
  theta *= 0.995; // reducing a bit to avoid out-of-range errors
  return theta;
}

export function getDefaultClipAngle(P) {
  var slug = getCrsSlug(P);
  if (slug == 'nsper') return getPerspectiveClipAngle(P);
  if (slug == 'tpers') {
    message('Automatic clipping is not supported for the Tilted Perspective projection');
    return 0;
  }
  return {
    gnom: 60,
    laea: 179,
    ortho: 89.9, // TODO: investigate projection errors closer to 90
    stere: 142,
    sterea: 142,
    ups: 10.5 // TODO: should be 6.5 deg at north pole
  }[slug] || 0;
}

export function getRotationParams(P) {
  var slug = getCrsSlug(P);
  if (slug == 'bertin1953') return [-16.5,-42];
  return null;
}



function getProjCenter(P) {
  var rtod = 180 / Math.PI;
  return [P.lam0 * rtod, P.phi0 * rtod];
}

// Convert a clip angle to a distance in meters
function getClippingRadius(P, angle) {
  return getCircleRadiusFromAngle(P, angle);
}

