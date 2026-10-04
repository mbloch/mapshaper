import { parseColor } from '../color/color-utils';
import { getOklchInterpolator, getVibrantColor } from '../color/oklab';
import { stop } from '../utils/mapshaper-logging';

// A ramp is defined by pins: [{t, color}], where t is a position from 0 (left
// end) to 1 (right end). Both ends must be pinned. Pins are stored by position
// rather than by tile index so they survive changes in the number of tiles.
// See docs/development/color-scheme-panel-design.md

// Returns an array of n colors. Pinned tiles take their pin's color; the
// others are interpolated in OKLCH between the nearest pinned tiles, so that
// lightness, chroma and hue each change by equal steps from tile to tile.
// opts.vibrance: a midtone chroma boost between each
// pair of pinned tiles (see getOklchInterpolator()).
export function resolveRamp(pins, n, opts) {
  return resolveRampTiles(pins, n, opts).map(function(tile) {
    return tile.color;
  });
}

// Like resolveRamp(), but returns a {color, pinned, adjusted, l, c, h, ideal}
// object for each tile. Interpolated tiles that had to be fitted to the sRGB
// gamut are adjusted, and ideal has the OKLCH values they were fitted from.
export function resolveRampTiles(pins, n, opts) {
  var slots = getPinnedSlots(pins, n);
  var tiles = [];
  var left = 0, right, interpolate, tile;
  for (var i=0; i<n; i++) {
    if (slots[i] > -1) {
      // vibrance raises a pinned color's chroma only as far as the gamut has
      // room at its own lightness, so it is never marked as adjusted
      tiles.push({color: getVibrantColor(pins[slots[i]].color, opts && opts.vibrance),
        pinned: true, adjusted: false});
      left = i;
      continue;
    }
    if (!interpolate || right < i) {
      right = i + 1;
      while (slots[right] == -1) right++;
      interpolate = getOklchInterpolator(pins[slots[left]].color, pins[slots[right]].color,
        Object.assign({}, opts, {steps: right - left}));
    }
    tile = interpolate((i - left) / (right - left));
    tile.pinned = false;
    tiles.push(tile);
  }
  return tiles;
}

// Returns an array of n tile slots, each containing the index of the pin
// that sets the tile's color, or -1 if the tile is interpolated.
// When several pins snap to the same tile, an end pin wins, otherwise the pin
// closest to the tile's own position.
export function getPinnedSlots(pins, n) {
  var slots = [], dists = [];
  validateRamp(pins, n);
  for (var i=0; i<n; i++) {
    slots.push(-1);
    dists.push(Infinity);
  }
  pins.forEach(function(pin, pinId) {
    var k = pin.t * (n - 1);
    var slot = Math.round(k);
    var dist = isEndPin(pin) ? -1 : Math.abs(k - slot);
    if (dist < dists[slot]) {
      slots[slot] = pinId;
      dists[slot] = dist;
    }
  });
  return slots;
}

// Returns a new pin array with tile i of an n-tile ramp pinned to color,
// replacing any pins that snap to the same tile.
export function setRampPin(pins, n, i, color) {
  validateTileIndex(i, n);
  if (!parseColor(color)) stop('Unsupported color:', color);
  return removePinsAtSlot(pins, n, i)
    .concat({t: getTilePosition(i, n), color: color})
    .sort(function(a, b) { return a.t - b.t; });
}

// Returns a new pin array with tile i unpinned. End tiles stay pinned.
export function clearRampPin(pins, n, i) {
  validateTileIndex(i, n);
  if (i === 0 || i == n - 1) return pins.concat();
  return removePinsAtSlot(pins, n, i);
}

function removePinsAtSlot(pins, n, i) {
  validateRamp(pins, n);
  return pins.filter(function(pin) {
    return Math.round(pin.t * (n - 1)) != i;
  });
}

function getTilePosition(i, n) {
  return i == n - 1 ? 1 : i / (n - 1);
}

function isEndPin(pin) {
  return pin.t === 0 || pin.t === 1;
}

function validateTileIndex(i, n) {
  if (!(i >= 0 && i < n && Math.floor(i) === i)) {
    stop('Invalid ramp tile index:', i);
  }
}

function validateRamp(pins, n) {
  if (!(n >= 2 && Math.floor(n) === n)) {
    stop('Invalid number of ramp colors:', n);
  }
  if (!Array.isArray(pins)) {
    stop('Expected an array of ramp pins');
  }
  pins.forEach(function(pin) {
    if (!(pin.t >= 0 && pin.t <= 1)) stop('Invalid ramp pin position:', pin.t);
    if (!parseColor(pin.color)) stop('Unsupported color:', pin.color);
  });
  if (!pins.some(function(pin) { return pin.t === 0; }) ||
      !pins.some(function(pin) { return pin.t === 1; })) {
    stop('A ramp must have pins at both ends');
  }
}
