
export function getSemiMinorAxis(P) {
  return P.a * Math.sqrt(1 - (P.es || 0));
}

