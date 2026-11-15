var GRAY = Object.freeze({color: Object.freeze([0]), alpha: -1});
var RGB = Object.freeze({color: Object.freeze([0, 1, 2]), alpha: -1});
var RGBA = Object.freeze({color: Object.freeze([0, 1, 2]), alpha: 3});

// The bands of a grid that are displayed, as grid band indexes:
// {color: [gray] or [red, green, blue], alpha: <index> or -1}
// A grid is displayed according to its band count (one or two bands are gray,
// three or more are RGB, and the fourth of four is alpha) unless grid.displayBands
// says otherwise, as for a grid that holds bands that aren't displayed. Code
// that changes the bands of a grid with displayBands must update or remove it.
// The returned object is shared; don't modify it.
export function getRasterDisplayBands(grid) {
  return grid.displayBands || getDefaultDisplayBands(grid.bands);
}

export function getDefaultDisplayBands(bandCount) {
  if (bandCount == 4) return RGBA;
  if (bandCount >= 3) return RGB;
  return GRAY;
}

export function rasterGridDisplaysColor(grid) {
  return getRasterDisplayBands(grid).color.length == 3;
}

export function rasterGridHasAlphaBand(grid) {
  return getRasterDisplayBands(grid).alpha > -1;
}

// e.g. 'rgba:0,1,2,3', for cache keys
export function getRasterDisplayBandsKey(grid) {
  var display = getRasterDisplayBands(grid);
  return (display.alpha > -1 ? 'rgba:' : display.color.length == 3 ? 'rgb:' : 'gray:') +
    display.color.concat(display.alpha > -1 ? [display.alpha] : []).join(',');
}
