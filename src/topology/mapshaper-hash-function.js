
// Get function to Hash an x, y point to a non-negative integer
export function getXYHash(size) {
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

// Get function to Hash a single coordinate to a non-negative integer
export function getXHash(size) {
  var buf = new ArrayBuffer(8),
      floats = new Float64Array(buf),
      uints = new Uint32Array(buf),
      lim = size | 0;
  if (lim > 0 === false) {
    throw new Error("Invalid size param: " + size);
  }

  return function(x) {
    var h;
    floats[0] = x;
    h = uints[0] ^ uints[1];
    h = h << 5 ^ h >> 7;
    return (h & 0x7fffffff) % lim;
  };
}
