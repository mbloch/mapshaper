// Arrowhead geometry shared by label callouts (svg-label-callout.mjs) and the
// ends of line features (svg-line-arrows.mjs), so that the two draw the same
// heads. Everything is in px, y down.

// The angle at an arrowhead's point, degrees. The open one is wider, since a
// narrow chevron drawn with a line reads as a thickened line more than as an
// arrow.
export var ARROW_ANGLE = 44;
export var OPEN_ARROW_ANGLE = 70;
// How far into a solid arrowhead the line reaches, as a fraction of the
// head's length: far enough that its cap is hidden, short of the tip.
export var ARROW_LINE_OVERLAP = 0.7;

var DEFAULT_LINE_WIDTH = 1;

// An arrowhead's size when nothing says, in px: the length of its sides. 10
// for a 1px line, growing with the line, so that a heavier line does not end
// in a head too small to read.
export function getDefaultArrowSize(lineWidth) {
  var w = lineWidth > 0 ? lineWidth : DEFAULT_LINE_WIDTH;
  return 7 + 3 * w;
}

// [tip, wing, wing], for a head with sides @side long meeting at @angle degrees,
// pointing at @tip from direction @dir (a unit vector from the tip back along
// the line)
export function getArrowHead(tip, dir, side, angle) {
  var len = getArrowHeadLength(side, angle);
  var half = side * Math.sin(angle / 2 * Math.PI / 180);
  var bx = tip[0] + dir[0] * len;
  var by = tip[1] + dir[1] * len;
  return [tip, [bx - dir[1] * half, by + dir[0] * half], [bx + dir[1] * half, by - dir[0] * half]];
}

// How far along the line a head with sides @side long reaches
export function getArrowHeadLength(side, angle) {
  return side * Math.cos(angle / 2 * Math.PI / 180);
}

// The part of polyline @coords after it first leaves the circle of radius @r
// around its first point, starting on the circle; or null if it never does.
export function trimPolyline(coords, r) {
  var p0 = coords[0];
  for (var i = 1; i < coords.length; i++) {
    if (distance(p0, coords[i]) > r) {
      return [getCircleExit(p0, r, coords[i - 1], coords[i])].concat(coords.slice(i));
    }
  }
  return null;
}

// The point where segment @p-@q, which starts inside the circle and ends
// outside it, crosses it.
export function getCircleExit(c, r, p, q) {
  var dx = q[0] - p[0];
  var dy = q[1] - p[1];
  var ex = p[0] - c[0];
  var ey = p[1] - c[1];
  var a = dx * dx + dy * dy;
  var b = 2 * (dx * ex + dy * ey);
  var k = ex * ex + ey * ey - r * r;
  var s = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * k))) / (2 * a);
  s = Math.max(0, Math.min(1, s));
  return [p[0] + s * dx, p[1] + s * dy];
}

export function getUnitVector(p, q) {
  var dx = q[0] - p[0];
  var dy = q[1] - p[1];
  var len = Math.sqrt(dx * dx + dy * dy);
  return len > 0 ? [dx / len, dy / len] : null;
}

export function distance(p, q) {
  var dx = q[0] - p[0];
  var dy = q[1] - p[1];
  return Math.sqrt(dx * dx + dy * dy);
}
