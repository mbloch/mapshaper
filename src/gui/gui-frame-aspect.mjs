import { El } from './gui-el';

// What an aspect ratio may be written as, in one place. The Add map frame
// dialog takes one typed into a field and the Frame properties panel offers
// presets plus a Custom field, but both go through parseFrameAspectRatio, so
// a ratio that is accepted in one panel is accepted in the other.

export var frameAspectPresets = [
  ['auto', 'From extent'],
  ['1', '1:1'],
  [String(4 / 3), '4:3'],
  [String(3 / 2), '3:2'],
  [String(16 / 9), '16:9'],
  ['custom', 'Custom']
];

export function makeFrameAspectSelect(parent) {
  var select = El('select').appendTo(parent);
  frameAspectPresets.forEach(function(item) {
    El('option').attr('value', item[0]).appendTo(select).text(item[1]);
  });
  return select;
}

// Accepts "5:4" or a bare number. Returns NaN for anything else, including a
// ratio with a zero or negative term.
export function parseFrameAspectRatio(value) {
  var parts = String(value).trim().split(':').map(Number);
  if (parts.length == 2) {
    return parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : NaN;
  }
  return parts.length == 1 ? parts[0] : NaN;
}

// Maps a stored ratio back onto the select's value.
export function getFrameAspectPreset(aspect) {
  if (!aspect) return 'auto';
  var match = frameAspectPresets.find(function(item) {
    return item[0] != 'auto' && item[0] != 'custom' &&
      Math.abs(Number(item[0]) - aspect) < 1e-10;
  });
  return match ? match[0] : 'custom';
}
