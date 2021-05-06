
export function getCrsSlug(P) {
  return P.params.proj.param; // kludge
}

export function isWorldProjection(P) {
  return getWorldProjections().includes(getCrsSlug(P));
}

export function isRotatedWorldProjection(P) {
  return isWorldProjection(P) && P.lam0 !== 0;
}

// TODO: rename this function
// These are projections that cover the entire world and can be rotated horizontally
//
// not included
// bertin1953 (doesn't rotate)
// euler (world? seems to need more params)
// murd1,murd2,murd3 (missing param)
//
// not implemented
// bonne,cc,collg,comill,fahey,igh,larr,lask
//
function getWorldProjections() {
  return 'robin,cupola,wintri,aitoff,apian,august,bacon,boggs,cea,crast,' +
  'denoy,eck1,eck2,eck3,eck4,eck5,eck6,eqc,eqearth,fouc,gall,gilbert,gins8,goode,' +
  'hammer,hatano,igh,kav5,kav7,loxim,mbt_fpp,mbt_fpq,mbt_fps,mbt_s,mbtfps,mill,' +
  'moll,natearth,natearth2,nell,nell_h,ortel,patterson,putp1,putp2,putp3,putp3p,' +
  'putp4p,putp5,putp5p,putp6,putp6p,qua_aut,times,vandg,vandg2,vandg3,vandg4,' +
  'wag1,wag2,wag3,wag4,wag5,wag6,wag7,weren,wink1,wink2'.split();
}
