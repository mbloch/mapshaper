import { sha1 } from '../utils/mapshaper-sha1';

// Decides whether a path-aligned label's text fits its path.
//
// The decision compares two numbers, and only one of them can be computed
// outside a browser. Path length is geometry, so export computes it; text width
// needs font metrics, which mapshaper only has in the GUI (canvas measureText()
// in gui-label-fonts.mjs). So the GUI measures once and stores the result in
// label-text-width, and export supplies the length.
//
// What is stored is the measured width, not a fits/doesn't-fit verdict, because
// a verdict would depend on output size and a width does not: text is exported
// at its native font-size, so its rendered width in output pixels is the same
// at every output size, while the path shrinks and grows.
//
// See docs/development/label-tool-design.md.

// Properties the stored width depends on. A change to any of them invalidates
// the measurement, so they are fingerprinted alongside the text itself.
//
// Note that 'css' and 'class' are deliberately absent: both can change the
// rendered font through a stylesheet mapshaper cannot see, so no fingerprint
// over record values could detect it.
var MEASURED_PROPERTIES = ['font-family', 'font-size', 'font-weight',
  'font-style', 'font-stretch', 'letter-spacing'];

var HASH_LENGTH = 12;

// Fingerprint of the values a width measurement depended on. Written next to
// the width by whatever measures the text, and re-derived at export time to
// detect that something has changed the text or the font since.
export function getLabelTextHash(rec) {
  var parts = [toHashInput(rec && rec['label-text'])];
  for (var i = 0; i < MEASURED_PROPERTIES.length; i++) {
    parts.push(toHashInput(rec && rec[MEASURED_PROPERTIES[i]]));
  }
  // \n is safe as a separator: label-text may contain newlines, but it is the
  // only multi-line field and it is always first
  return sha1(parts.join('\n')).substr(0, HASH_LENGTH);
}

function toHashInput(val) {
  return val === null || val === undefined ? '' : String(val);
}

// One of:
//   'fits'       the text is known to fit
//   'overflow'   the text is known not to fit; export drops the label
//   'unmeasured' no width is stored, so fit is unknown
//   'stale'      a width is stored but its fingerprint no longer matches
//
// 'unmeasured' and 'stale' both render, because silently deleting a label from
// a map is a worse outcome than drawing one that overflows: an overflow is
// visible and fixable, a deletion is neither.
export function getLabelFitState(rec, pathLength) {
  var width = rec && rec['label-text-width'];
  var hash = rec && rec['label-text-hash'];
  if (width > 0 === false) return 'unmeasured';
  // A missing fingerprint means no guard was requested rather than a failed
  // guard -- an explicit -add-label text-width= is a deliberate opt-in to the
  // drop rule by a script that knows its own metrics.
  if (hash && hash !== getLabelTextHash(rec)) return 'stale';
  return width <= pathLength ? 'fits' : 'overflow';
}
