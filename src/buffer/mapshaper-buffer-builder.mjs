import { error } from '../utils/mapshaper-logging';

// Assembles buffer rings from path vertices and offset ("buffer") vertices.
// A ring runs backwards along the original path, then forwards along the
// offset polyline, enclosing the buffered area between them.
//
// Each vertex carries a source position (the index of the source-path segment
// it derives from), tracked parallel to the coordinates. Path-side vertices get
// NaN: loop removal uses these positions to gate which self-crossings it
// collapses, and a NaN position marks geometry (the source-path edge, caps)
// that a collapsible overshoot pocket must never span.
export function BufferBuilder() {
  var self = {};
  var buffer, path, bufferPos, pathPos;

  init();

  function init() {
    buffer = [];
    path = [];
    bufferPos = [];
    pathPos = [];
  }

  self.size = function() {
    return path.length + buffer.length;
  };

  self.addPathVertex = function(p) {
    path.push(p);
    pathPos.push(NaN);
  };

  self.addBufferVertices = function(arr, pos) {
    for (var i=0; i<arr.length; i++) {
      self.addBufferVertex(arr[i], pos);
    }
  };

  self.addBufferVertex = function(p, pos) {
    var prevP = buffer[buffer.length - 1];
    if (prevP && pointsAreSame(prevP, p)) {
      return;
    }
    buffer.push(p);
    bufferPos.push(pos === undefined ? NaN : pos);
  };

  // Returns {ring, srcPos}: ring is the closed coordinate ring (first point
  // repeated as last); srcPos is the parallel source-position array.
  // @allowDegenerate: return null instead of erroring when the ring collapsed
  // to fewer than 3 points (an offset loop whose source ring shrank away, e.g.
  // a hole smaller than the buffer radius) -- a normal outcome, not a bug.
  self.done = function(allowDegenerate) {
    var ring = path.slice().reverse().concat(buffer);
    var srcPos = pathPos.slice().reverse().concat(bufferPos);
    if (ring.length < 3) {
      if (allowDegenerate) {
        init();
        return null;
      }
      error('Defective buffer ring:', ring);
    }
    ring.push(ring[0].concat());
    srcPos.push(srcPos[0]);
    init();
    return {ring: ring, srcPos: srcPos};
  };

  return self;
}

function pointsAreSame(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
