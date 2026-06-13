import { error } from '../utils/mapshaper-logging';

// Assembles buffer rings from path vertices and offset ("buffer") vertices.
// A ring runs backwards along the original path, then forwards along the
// offset polyline, enclosing the buffered area between them.
export function BufferBuilder() {
  var self = {};
  var buffer, path;

  init();

  function init() {
    buffer = [];
    path = [];
  }

  self.size = function() {
    return path.length + buffer.length;
  };

  self.addPathVertex = function(p) {
    path.push(p);
  };

  self.addBufferVertices = function(arr) {
    for (var i=0; i<arr.length; i++) {
      self.addBufferVertex(arr[i]);
    }
  };

  self.addBufferVertex = function(p) {
    var prevP = buffer[buffer.length - 1];
    if (prevP && pointsAreSame(prevP, p)) {
      return;
    }
    buffer.push(p);
  };

  self.done = function() {
    var ring = path.reverse().concat(buffer);
    if (ring.length < 3) {
      error('Defective buffer ring:', ring);
    }
    ring.push(ring[0].concat());
    init();
    return ring;
  };

  return self;
}

function pointsAreSame(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
