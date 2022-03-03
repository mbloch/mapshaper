
// Utility functions for GeoJSON-style lat-long [x,y] coordinates and arrays of coords

var e = 1e-10;
var T = 90 - e;
var L = -180 + e;
var B = -90 + e;
var R = 180 - e;

export function lastEl(arr) {
  return arr[arr.length - 1];
}

export function samePoint(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

export function isClosedPath(arr) {
  return samePoint(arr[0], lastEl(arr));
}

// duplicate points occur if a vertex is on the antimeridan
export function dedup(ring) {
  return ring.reduce(function(memo, p, i) {
    var pp = memo.length > 0 ? memo[memo.length-1] : null;
    if (!pp || pp[0] != p[0] || pp[1] != p[1]) memo.push(p);
    return memo;
  }, []);
}

// remove likely rounding errors
export function snapToEdge(p) {
  if (p[0] <= L) p[0] = -180;
  if (p[0] >= R) p[0] = 180;
  if (p[1] <= B) p[1] = -90;
  if (p[1] >= T) p[1] = 90;
}

export function onPole(p) {
  return p[1] >= T || p[1] <= B;
}

export function isWholeWorld(coords) {
  // TODO: check that l,r,t,b are all reached
  for (var i=0, n=coords.length; i<n; i++) {
    if (!isEdgePoint(coords[i])) return false;
  }
  return true;
}

export function touchesEdge(coords) {
  for (var i=0, n=coords.length; i<n; i++) {
    if (isEdgePoint(coords[i])) return true;
  }
  return false;
}

export function isEdgeSegment(a, b) {
  // TODO: handle segments between pole and non-edge point
  // (these shoudn't exist in a properly clipped path)
  return (onPole(a) || onPole(b)) ||
    a[0] <= L && b[0] <= L || a[0] >= R && b[0] >= R;
}

export function isEdgePoint(p) {
  return p[1] <= B || p[1] >= T || p[0] <= L || p[0] >= R;
}



