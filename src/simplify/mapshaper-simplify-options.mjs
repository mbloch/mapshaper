// Small option-shape helpers shared between -simplify (the command) and
// the simplify-info reporter. Extracted so neither side needs to import
// from the other.

export function useSphericalSimplify(arcs, opts) {
  return !opts.planar && !arcs.isPlanar();
}

export function getSimplifyMethod(opts) {
  var m = opts.method;
  if (!m || m == 'weighted' || m == 'visvalingam' && opts.weighting) {
    m =  'weighted_visvalingam';
  }
  return m;
}
