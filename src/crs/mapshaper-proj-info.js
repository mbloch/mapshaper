import { getSemiMinorAxis } from '../crs/mapshaper-proj-utils';
import { message } from '../utils/mapshaper-logging';

export function getCrsSlug(P) {
  return P.params.proj.param; // kludge
}

// 'normal' = the projection is aligned to the Earth's axis
// (i.e. it has a normal aspect)
export function isRotatedNormalProjection(P) {
  return isAxisAligned(P) && P.lam0 !== 0;
}

export function isAxisAligned(P) {
  return !isNonNormal(P);
}

export function isClippedCylindricalProjection(P) {
  // TODO: add tmerc, etmerc, ...
  return inList(P, 'merc');
}

export function getDefaultClipBBox(P) {
  return {
    merc: [-180, -87, 180, 87]
  }[getCrsSlug(P)] || null;
}

// TODO: add nsper, tpers
export function isClippedAzimuthalProjection(P) {
  return inList(P, 'stere,sterea,ups,ortho,gnom,laea,nsper,tpers');
}

function getPerspectiveClipAngle(P) {
  var h = parseFloat(P.params.h.param);
  if (!h || h < P.a) {

    return 0;
  }
  var theta = Math.acos(P.a / h) * 180 / Math.PI;
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
    ortho: 90,
    stere: 142,
    stereea: 142,
    ups: 10.5 // TODO: should be 6.5 deg at north pole
  }[slug] || 0;
}

function isNonNormal(P) {
  var others = 'cassini,gnom,bertin1953,chamb,ob_tran,tpeqd,healpix,rhealpix,' +
    'ob_tran,ocea,omerc,tmerc,etmerc';
  return isAzimuthal(P) || inList(P, others);
}

export function isAzimuthal(P) {
  return inList(P,
    'aeqd,gnom,laea,mil_os,lee_os,gs48,alsk,gs50,nsper,tpers,ortho,qsc,stere,ups,sterea');
}

function inList(P, str) {
  return str.split(',').includes(getCrsSlug(P));
}
