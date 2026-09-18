import { sha1 } from '../utils/mapshaper-sha1';

// How wide a label's text renders, which is the one thing about a label that
// cannot be worked out from the data.
//
// Two features need it: `label-align`, which holds a block of text still while
// the lines inside it re-justify (svg-label-align.mjs), and the path-fit check,
// which drops a path label whose text is longer than its path
// (svg-label-fit.mjs). Both need font metrics, which mapshaper has only in a
// browser, so the GUI installs a measure function here and the answers are
// memoized.
//
// **A measurement is not the user's data.** It is derived from values the user
// did set -- the text and six font properties -- and it lives in this cache
// alone: no column in the table, nothing exported, nothing for an edit to keep
// in step with. See docs/development/label-tool-design.md.
//
// The cache is keyed by a fingerprint of exactly the values the width depends
// on, which is what makes that safe: a width is a pure function of its inputs,
// so a cache entry cannot go stale -- change the text or the font and the
// fingerprint changes with it, and the lookup simply misses. Nothing has to be
// invalidated, and a feature can be copied, merged, filtered or renumbered
// without its measurement following it around, because the measurement was
// never attached to the feature in the first place.

// Properties the width depends on. A change to any of them gives a different
// fingerprint, so a measurement is never read for text it does not describe.
//
// Note that 'css' and 'class' are deliberately absent: both can change the
// rendered font through a stylesheet mapshaper cannot see, so no fingerprint
// over record values could detect it.
var MEASURED_PROPERTIES = ['font-family', 'font-size', 'font-weight',
  'font-style', 'font-stretch', 'letter-spacing'];

var HASH_LENGTH = 12;

// Entries are a dozen bytes of key and a number, and one per distinct text and
// font -- typing a label adds one per keystroke, since each prefix is its own
// string. The cap is generous enough never to be reached in an editing session
// and small enough to bound a session that runs for days.
var CACHE_LIMIT = 20000;

var cache = new Map();
var measureFn = null;
var measuring = false;

// Installed by the GUI at startup: (rec) -> width in px, or null.
//
// An inversion, and a deliberate one. The alternative was for the GUI to
// measure ahead of every reader -- before each render, before each export,
// after each edit -- which is three hooks to keep in step and a fourth for the
// console, where a user can type -o svg without going near the export dialog.
// A reader that can ask for a measurement needs no hooks at all, and in Node,
// where nothing installs one, every reader falls back exactly as it did before
// this existed.
export function setTextMeasureFunction(fn) {
  measureFn = fn || null;
}

// The width of @rec's text in px at its own font size, or null if it cannot be
// known. Measures on demand and remembers the answer, including a failure to
// measure, so a label that cannot be measured is not measured repeatedly.
export function getMeasuredTextWidth(rec) {
  var hash, width;
  if (!rec || !rec['label-text']) return null;
  hash = getTextWidthKey(rec);
  if (cache.has(hash)) return cache.get(hash) || null;
  // Nothing to measure with is not an answer about this text, so it is not
  // remembered as one. Caching it would mean that whatever rendered before the
  // GUI installed its measure function -- or during any window in which none
  // is installed -- decided the width of that text for the rest of the
  // session.
  if (!measureFn) return null;
  width = measure(rec);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(hash, width || 0);
  return width;
}

// A measurement is itself a render, so it must not ask for one: rendering an
// aligned label reads a width, and a measurement taken in the middle of that
// would be measuring in order to measure. The GUI's measure function drops
// label-align for this reason; the flag is the backstop.
function measure(rec) {
  var width;
  if (measuring) return null;
  measuring = true;
  try {
    width = measureFn(rec);
  } catch (e) {
    width = null;
  }
  measuring = false;
  return width > 0 ? width : null;
}

// Fingerprint of the values a width depends on, and so the key it is kept
// under.
export function getTextWidthKey(rec) {
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

// For tests, and for a session that wants to measure again from scratch.
export function clearTextWidthCache() {
  cache.clear();
}

export function getTextWidthCacheSize() {
  return cache.size;
}
