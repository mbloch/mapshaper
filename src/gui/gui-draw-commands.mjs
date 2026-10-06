import { quoteCommandValue } from './gui-command-utils';

// Turns a path drawn with the line or polygon tool into the command that
// creates it, as a pure function so that it can be tested without a map. A
// drawn shape is one -add-shape command, which is what gives it one undo step
// and a line in the session history that replays it.

// coords: [[x, y], ...] the path's vertices, in the layer's CRS
// opts:
//   geometryType: 'polyline' or 'polygon', the type of the layer drawn into
//   target: the layer's name, or null to use the current target. Naming it
//     makes the command replay against the same layer from the session history.
//   style: (optional) style properties for the new shape, e.g. {stroke: 'red'}
//   extend: (optional) join the path to the line that ends at its first vertex
//     rather than adding a new line
export function getAddShapeCommand(coords, opts) {
  var o = opts || {};
  var parts = ['-add-shape', 'coordinates=' + formatCoords(coords)];
  if (o.geometryType == 'polygon' && !isClosedRing(coords)) {
    parts.push('closed');
  }
  if (o.extend) {
    parts.push('extend');
  }
  Object.keys(o.style || {}).forEach(function(name) {
    var val = o.style[name];
    if (val === '' || val === null || val === undefined) return;
    parts.push(name + '=' + formatStyleValue(val));
  });
  if (o.target) {
    parts.push('target=' + quoteCommandValue(o.target));
  }
  return parts.join(' ');
}

// Whether a path drawn into a layer of @geometryType is complete enough to be
// added to it: two vertices for a line, three for a polygon (not counting a
// vertex that repeats the first one to close the ring).
export function drawnPathIsValid(coords, geometryType) {
  var n = countDistinctVertices(coords);
  return geometryType == 'polygon' ? n >= 3 : n >= 2;
}

// a number, as typed into a panel field, is written as it would be typed
function formatStyleValue(val) {
  return /^-?(\d+\.?\d*|\.\d+)$/.test(String(val)) ? String(val) : quoteCommandValue(val);
}

function countDistinctVertices(coords) {
  var n = 0;
  for (var i = 0; i < coords.length; i++) {
    if (i === 0 || !samePoint(coords[i], coords[i - 1])) n++;
  }
  if (n > 1 && samePoint(coords[0], coords[coords.length - 1])) n--;
  return n;
}

function isClosedRing(coords) {
  return coords.length > 3 && samePoint(coords[0], coords[coords.length - 1]);
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

// Coordinates are written at full precision: they are the shape's geometry, and
// rounding them would move a vertex that was snapped to another feature.
function formatCoords(coords) {
  var parts = [];
  for (var i = 0; i < coords.length; i++) {
    parts.push(coords[i][0], coords[i][1]);
  }
  return parts.join(',');
}
