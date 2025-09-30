import { Bounds } from '../geom/mapshaper-bounds';
import { testSegmentBoundsIntersection } from '../geom/mapshaper-bounds-geom';
import { error } from '../utils/mapshaper-logging';

export function BufferBuilder(bufferIntersection, opts) {
  var self = {};
  var buffer, path, insideFlags;
  var points = [];
  var backtrackSteps = opts.backtrack >= 0 ? opts.backtrack : 100;
  var backtrackStopIdx = 0; // lowest vertex id in backtrack pass
  var useShortCircuit = false; //  true;
  // using backtrack bounds seems slower than without
  var useBacktrackBounds = false;
  var backtrackBounds;
  var backtrackBoundsLag = 20;
  var _bbox;
  var _idx;

  init();

  function init() {
    buffer = [];
    path = [];
    insideFlags = [];
    backtrackStopIdx = 0;
    backtrackBounds = null;
    _bbox = null;
    _idx = -1;
  }

  self.size = function() {
    return path.length + buffer.length;
  };

  self.getDebugPoints = function() {
    var tmp = points;
    points = [];
    return tmp;
  };

  function makeDebugPoints() {
    points = points.concat(buffer.map((p, i) => {
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: p
        },
        properties: {
          id: i,
          inside: insideFlags[i],
          fill: insideFlags[i] ? 'magenta' : 'dodgerblue'
        }
      };
    }));
  }

  self.addPathVertex = function(p) {
    path.push(p);
  };

  self.addBufferVertices = function(arr) {
    for (var i=0; i<arr.length; i++) {
      self.addBufferVertex(arr[i]);
    }
  };

  self.addBufferVertex = function(p, isLeftTurn) {
    var bufferLen = insideFlags.length;
    var prevIdx = bufferLen - 1;

    // TODO: check if p is same or very close to previous point
    if (useBacktrackBounds && bufferLen >= backtrackBoundsLag) {
      if (bufferLen == backtrackBoundsLag) {
        backtrackBounds = new Bounds();
      }
      var tmp = buffer[bufferLen - backtrackBoundsLag];
      backtrackBounds.mergePoint(tmp[0], tmp[1]);
    }
    if (isLeftTurn) {
      // first extruded point after left turn
      // assume that the point is inside the buffer
      insideFlags.push(true);
      buffer.push(p);
      return;
    }
    if (prevIdx == -1) {
      // first point in buffer
      buffer.push(p);
      insideFlags.push(false);
      return;
    }
    var prevP = buffer[prevIdx];
    var prevFlag = insideFlags[prevIdx];
    if (pointsAreSame(prevP, p)) {
      // console.log('SAME POINT')
      return;
    }
    // if no segment cross is detected below, inside/outside stays the same
    var newFlag = prevFlag;
    var hit, a, b, flagA, flagB, turn;
    var hitCount = 0;
    for (var i=0, idx = bufferLen - 3; i < backtrackSteps && idx >= backtrackStopIdx; i++, idx--) {

      if (useBacktrackBounds && idx + backtrackBoundsLag == bufferLen) {
        if (!testSegmentBoundsIntersection(p, prevP, backtrackBounds)) {
          break;
        }
      }
      a = buffer[idx];
      b = buffer[idx + 1];
      // TODO: consider using a geodetic intersection function for lat-long datasets
      // TODO: consider case of an endpoint hit
      // TODO: consider case of collinear hit
      hit = bufferIntersection(a, b, prevP, p);
      if (!hit) {
        // continue scanning backward for an intersection
        continue;
      }
      hitCount++;

      flagA = insideFlags[idx];
      flagB = insideFlags[idx + 1];
      if (flagA && flagB) {
        // newest segment collides with an interior segment - do not rewind
        continue;
      }
      if (useShortCircuit && prevFlag === false) {
        // if segment intersects an outside segment from outside the buffer,
        // we are likely closing a loop,
        // so we stop backtracking and reset the backtrack limit to avoid
        // removing the loop
        backtrackStopIdx = i + 1;
        break;
      }

      // newest segment collides with an exterior segment
      // * assume we're going from inside to outside
      // * and can therefore remove an interior loop
      // TODO: improve (this assumption does not hold when closing an oxbow type loop)
      while (buffer.length > idx + 1) {
        buffer.pop();
        insideFlags.pop();
      }
      buffer.push(hit);
      insideFlags.push(false);
      newFlag = false;
      // console.log("going out")
      break;
    }

    buffer.push(p);
    insideFlags.push(newFlag);
  };

  self.done = function() {
    if (opts.debug_points) {
      makeDebugPoints();
    }
    var ring = path.reverse().concat(buffer);
    if (ring.length < 3) {
      error('Defective buffer ring:', ring);
    }
    ring.push(ring[0]);
    init();
    return ring;
  };

  return self;
}

function pointsAreSame(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function extend(n, d, k) {
  return n + d * k;
}

// function countExtendedHits(p0, p1, buffer) {
//   var bbox = getBbox();
//   var width = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
//   var p2 = [extend(p1[0], p1[0] - p0[0], size), extend(p1[1], p1[1] - p0[1], size)];
//   var hits = 0;
//   for (var i=backtrackStopIdx, n = buffer.length-1; i<n; i++) {
//     if (bufferIntersection(buffer[i], buffer[i+1], p1, p2)) {
//       hits++;
//     }
//   }
//   return hits;
// };
