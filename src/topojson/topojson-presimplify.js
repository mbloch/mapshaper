
export function getPresimplifyFunction(width) {
  var quanta = 10000,  // enough resolution for pixel-level detail at 1000px width and 10x zoom
      k = quanta / width;
  return function(z) {
    // could substitute a rounding function with decimal precision
    return z === Infinity ? 0 : Math.ceil(z * k);
  };
}
