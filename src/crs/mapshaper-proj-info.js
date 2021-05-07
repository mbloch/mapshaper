
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

function isNonNormal(P) {
  var others = 'cassini,gnom,bertin1953,chamb,ob_tran,tpeqd,healpix,rhealpix,' +
    'ob_tran,ocea,omerc,tmerc,etmerc';
  return isAzimuthal(P) || inList(P, others);
}

function isAzimuthal(P) {
  return inList(P,
    'aeqd,gnom,laea,mil_os,lee_os,gs48,alsk,gs50,nsper,tpers,ortho,qsc,stere,ups,sterea');
}

function inList(P, str) {
  return str.split(',').includes(getCrsSlug(P));
}
