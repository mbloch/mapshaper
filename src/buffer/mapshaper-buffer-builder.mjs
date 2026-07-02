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
  var buffer, path, bufferPos, pathPos, bufferTags, pathTags;

  init();

  function init() {
    buffer = [];
    path = [];
    bufferPos = [];
    pathPos = [];
    // Parallel reversed-arc ("dip") tags: 1 marks a vertex emitted as part of a
    // reversed concave-join arc (a pure self-overlap construction artifact) so
    // the coverage-based loop remover can key on provenance. Path-side vertices
    // (the source-path edge) and untagged callers default to 0.
    bufferTags = [];
    pathTags = [];
  }

  self.size = function() {
    return path.length + buffer.length;
  };

  self.addPathVertex = function(p) {
    path.push(p);
    pathPos.push(NaN);
    pathTags.push(0);
  };

  self.addBufferVertices = function(arr, pos, tag) {
    for (var i=0; i<arr.length; i++) {
      self.addBufferVertex(arr[i], pos, tag);
    }
  };

  self.addBufferVertex = function(p, pos, tag) {
    var prevP = buffer[buffer.length - 1];
    if (prevP && pointsAreSame(prevP, p)) {
      return;
    }
    buffer.push(p);
    bufferPos.push(pos === undefined ? NaN : pos);
    bufferTags.push(tag ? 1 : 0);
  };

  // Returns {ring, srcPos, dipTags}: ring is the closed coordinate ring (first
  // point repeated as last); srcPos and dipTags are parallel arrays (source
  // position and reversed-arc tag).
  // @allowDegenerate: return null instead of erroring when the ring collapsed
  // to fewer than 3 points (an offset loop whose source ring shrank away, e.g.
  // a hole smaller than the buffer radius) -- a normal outcome, not a bug.
  self.done = function(allowDegenerate) {
    var ring = path.slice().reverse().concat(buffer);
    var srcPos = pathPos.slice().reverse().concat(bufferPos);
    var dipTags = pathTags.slice().reverse().concat(bufferTags);
    if (ring.length < 3) {
      if (allowDegenerate) {
        init();
        return null;
      }
      error('Defective buffer ring:', ring);
    }
    ring.push(ring[0].concat());
    srcPos.push(srcPos[0]);
    dipTags.push(dipTags[0]);
    init();
    return {ring: ring, srcPos: srcPos, dipTags: dipTags};
  };

  return self;
}

function pointsAreSame(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
