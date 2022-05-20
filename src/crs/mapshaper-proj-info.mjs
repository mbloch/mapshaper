import { getSemiMinorAxis } from '../crs/mapshaper-proj-utils';
import { getAntimeridian } from '../geom/mapshaper-latlon';
import { message } from '../utils/mapshaper-logging';

export function getCrsSlug(P) {
  return P.params.proj.param; // kludge
}

// 'normal' = the projection is aligned to the Earth's axis
// (i.e. it has a normal aspect)
export function isRotatedNormalProjection(P) {
  return isAxisAligned(P) && P.lam0 !== 0;
}

// Projection is vertically aligned to earth's axis
export function isAxisAligned(P) {
  // TODO: consider projections that may or may not be aligned,
  // depending on parameters
  if (inList(P, 'cassini,gnom,bertin1953,chamb,ob_tran,tpeqd,healpix,rhealpix,' +
    'ocea,omerc,tmerc,etmerc')) {
    return false;
  }
  if (isAzimuthal(P)) {
    return false;
  }
  return true;
}

export function getBoundingMeridian(P) {
  if (P.lam0 === 0) return 180;
  return getAntimeridian(P.lam0 * 180 / Math.PI);
}

// Are the projection's bounds meridians?
export function isMeridianBounded(P) {
  // TODO: add azimuthal projection with lat0 == 0
  // if (inList(P, 'ortho') && P.lam0 === 0) return true;
  return isAxisAligned(P); // TODO: look for exceptions to this
}

// Is the projection bounded by parallels or polar lines?
export function isParallelBounded(P) {
  // TODO: add polar azimuthal projections
  // TODO: reject world projections that do not have polar lines
  return isAxisAligned(P);
}


export function isConic(P) {
  return inList(P, 'aea,bonne,eqdc,lcc,poly,euler,murd1,murd2,murd3,pconic,tissot,vitk1');
}

export function isAzimuthal(P) {
  return inList(P,
    'aeqd,gnom,laea,mil_os,lee_os,gs48,alsk,gs50,nsper,tpers,ortho,qsc,stere,ups,sterea');
}

export function inList(P, str) {
  return str.split(',').includes(getCrsSlug(P));
}
