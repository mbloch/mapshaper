import { convertBboxToGeoJSON } from '../commands/mapshaper-rectangle';
import { getGeodeticSegmentFunction } from '../geom/mapshaper-geodesic';
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

export function getClippingDataset(src, dest, opts) {
  return getUnprojectedBoundingPolygon(src, dest, opts);
}

export function getUnprojectedBoundingPolygon(src, dest, opts) {
  var dataset;
  if (isCircleClippedProjection(dest) || opts.clip_angle || dest.clip_angle) {
    dataset = getBoundingCircle(src, dest, opts);
  } else if (isRectangleClippedProjection(dest) || opts.clip_bbox) {
    dataset = getBoundingRectangle(dest, opts);
  }
  return dataset || null;
}

// If possible, return a lat-long bbox that can be used to
// test whether data exceeds the projection bounds ands needs to be clipped
// export function getInnerBoundingBBox(P, opts) {
//   var bbox = null;
//   if (opts.clip_bbox) {
//     bbox = opts.clip_bbox;
//   } else if (isRectangleClippedProjection(dest)) {
//     bbox
//   }
//   return bbox;
// }

// Return projected polygon extent of both clipped and unclipped projections
export function getPolygonDataset(src, dest, opts) {
  // use clipping area if projection is clipped
  var dataset = getUnprojectedBoundingPolygon(src, dest, opts);
  if (!dataset) {
    // use entire world if projection is not clipped
    dataset = getBoundingRectangle(dest, {clip_bbox: [-180,-90,180,90]});
  }
  projectDataset(dataset, src, dest, {no_clip: false, quiet: true});
  return dataset;
}

// Return projected outline of clipped projections
export function getOutlineDataset(src, dest, opts) {
  var dataset = getUnprojectedBoundingPolygon(src, dest, opts);
  if (dataset) {
    // project, with cutting & cleanup
    projectDataset(dataset, src, dest, {no_clip: false, quiet: true});
    dataset.layers[0].geometry_type = 'polyline';
  }
  return dataset || null;
}

function getBoundingRectangle(dest, opts) {
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

function getBoundingCircle(src, dest, opts) {
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

export function isRectangleClippedProjection(P) {
  // TODO: add tmerc, etmerc, ...
  // return inList(P, 'tmerc,utm,etmerc,merc,bertin1953');
  return inList(P, 'merc,bertin1953');
}

export function getDefaultClipBBox(P) {
  var e = 1e-3;
  var slug = getCrsSlug(P);
  var tmerc = [-179,-90,179,90];
  var bbox = {
    // longlat: [-180, -90, 180, 90],
    tmerc: tmerc,
    utm: tmerc,
    etmerc: tmerc,
    merc: [-180, -89, 180, 89],
    lcc: [-180, -89, 180, 89],
    bertin1953: [-180 + e, -90 + e, 180 - e, 90 - e]
  }[slug];
  return bbox;
}

export function getClampBBox(P) {
  var bbox;
  if (inList(P, 'merc,lcc')) {
    bbox = getDefaultClipBBox(P);
  }
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
    //ortho: 89.9, // projection errors betwen lat +/-35 to 55
    ortho: 89.85, // TODO: investigate
    stere: 142,
    sterea: 142,
    ups: 10.5 // TODO: should be 6.5 deg at north pole
  }[slug] || 0;
}

export function getRotationParams(P) {
  var slug = getCrsSlug(P);
  if (slug == 'bertin1953') return [-16.5,-42];
  if (slug == 'tmerc' || slug == 'utm' || slug == 'etmerc') {
    if (P.lam0 !== 0) return [P.lam0 * 180 / Math.PI];
  }
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

