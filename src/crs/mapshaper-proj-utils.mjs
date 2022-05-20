
export function getSemiMinorAxis(P) {
  return P.a * Math.sqrt(1 - (P.es || 0));
}

export function getCircleRadiusFromAngle(P, angle) {
  // Using semi-minor axis radius, to prevent overflowing projection bounds
  // when clipping up to the edge of the projectable area
  // TODO: improve (this just gives a safe minimum distance, not the best distance)
  // TODO: modify point buffer function to use angle + ellipsoidal geometry
  return angle * Math.PI / 180 * getSemiMinorAxis(P);
}
