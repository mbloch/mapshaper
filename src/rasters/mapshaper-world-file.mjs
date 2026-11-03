import { stop } from '../utils/mapshaper-logging';

// Transforms here map a pixel's corner to map coordinates:
// x = t[0] * col + t[1] * row + t[2], y = t[3] * col + t[4] * row + t[5]

export function parseWorldFile(content) {
  if (!content) return null;
  var vals = String(content).trim().split(/\s+/).map(Number);
  if (vals.length < 6 || vals.some(function(val) { return !isFinite(val); })) {
    stop('Invalid world file');
  }
  return vals.slice(0, 6);
}

// A world file locates the center of the top-left pixel, rather than its corner
export function getWorldTransform(world) {
  var a = world[0], d = world[1], b = world[2], e = world[3],
      c = world[4], f = world[5];
  return [
    a,
    b,
    c - a / 2 - b / 2,
    d,
    e,
    f - d / 2 - e / 2
  ];
}

// For an image with no georeferencing: one unit per pixel, with the origin at
// the bottom-left corner, so the image is the right way up on the map
export function getPixelTransform(height) {
  return [1, 0, 0, 0, -1, height];
}

export function getPixelCoordinatesWarning(name) {
  return name + ' has no georeferencing, so it was imported in pixel' +
    ' coordinates, with the origin at its bottom-left corner. It cannot be' +
    ' projected or shown over a basemap. To place it on a map, add a world' +
    ' file (e.g. a .tfw, .pgw or .jgw file).';
}

// @sx, @sy: source pixels per imported pixel, across and down
export function scaleWorldTransform(t, sx, sy) {
  return [t[0] * sx, t[1] * sy, t[2], t[3] * sx, t[4] * sy, t[5]];
}

export function getWorldFileBBox(transform, width, height) {
  var corners = [
    transformPoint(transform, 0, 0),
    transformPoint(transform, width, 0),
    transformPoint(transform, width, height),
    transformPoint(transform, 0, height)
  ];
  var xs = corners.map(function(p) { return p[0]; });
  var ys = corners.map(function(p) { return p[1]; });
  return [
    Math.min.apply(null, xs),
    Math.min.apply(null, ys),
    Math.max.apply(null, xs),
    Math.max.apply(null, ys)
  ];
}

function transformPoint(t, col, row) {
  return [
    t[0] * col + t[1] * row + t[2],
    t[3] * col + t[4] * row + t[5]
  ];
}
