

// Get function to Hash an x, y point to a non-negative integer
function getXYHash(size) {
  var buf = new ArrayBuffer(16),
      floats = new Float64Array(buf),
      uints = new Uint32Array(buf),
      lim = size | 0;
  if (lim > 0 === false) {
    throw new Error("Invalid size param: " + size);
  }

  return function(x, y) {
    var u = uints, h;
    floats[0] = x;
    floats[1] = y;
    h = u[0] ^ u[1];
    h = h << 5 ^ h >> 7 ^ u[2] ^ u[3];
    return (h & 0x7fffffff) % lim;
  };
}