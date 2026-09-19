import { internal } from './gui-core';

// The GUI's answer to "how wide does this text render", which is the question
// the core cannot answer on its own.
//
// Installed once at startup as the measure function of svg-label-metrics.mjs,
// which memoizes what comes back and reads it out again for `label-align` and
// for the path-fit check. Nothing is written to the user's data: a measurement
// is derived from the text and the font, so it belongs in a cache keyed by
// those, not in two columns of everybody's GeoJSON.
//
// A *record* is measured rather than a label on the map, because the width is
// usually wanted for a label as it is about to be -- text being typed, a font
// just chosen -- and because a label that is off screen, or on a layer that is
// not displayed, still has to export correctly. So the record is rendered by
// the same code the map uses, into an offscreen <svg>, and measured there.
//
// See docs/development/label-tool-design.md.

var measureSvg = null;

export function initLabelMeasurement() {
  internal.svg.setTextMeasureFunction(measureLabelWidth);
}

// Width in px of the widest line of @rec's text, at its own font size, or null
// if it cannot be measured -- no text, or no document to render into.
//
// getBBox() is in user units and so is font-size, which is what makes this
// independent of the map's zoom: the number is the same whatever scale the
// label is being viewed at, and stays true after the map moves.
export function measureLabelWidth(rec) {
  var svg = getMeasureSvg();
  var text = internal.svg.toLabelString(rec && rec['label-text']);
  var node, box;
  if (!svg || !text) return null;
  svg.innerHTML = internal.svg.stringify({
    tag: 'g',
    // The defaults a label inherits from its layer's group. Without them the
    // browser's own font and size apply, and the measurement would describe a
    // label nobody is looking at.
    properties: internal.getLabelTextDefaults(),
    children: [internal.svg.renderStyledLabel(toMeasuredRecord(rec))]
  });
  node = svg.querySelector('text');
  box = node && measure(node);
  svg.innerHTML = '';
  return box && box.width > 0 ? box.width : null;
}

// Alignment is dropped before rendering the sample. It cannot change how wide
// the text is -- it moves the lines, it does not set them -- and rendering it
// would have the renderer ask for the very measurement being taken.
function toMeasuredRecord(rec) {
  if (!rec || !rec['label-align']) return rec;
  var out = Object.assign({}, rec);
  delete out['label-align'];
  return out;
}

function measure(node) {
  try {
    return node.getBBox();
  } catch (e) {
    return null; // an unrendered node has no box to report
  }
}

// One offscreen <svg>, kept for the life of the session. Positioned off the
// page rather than hidden with display:none, which gives an element no layout
// and its text no box to measure.
function getMeasureSvg() {
  if (measureSvg) return measureSvg;
  if (typeof document == 'undefined') return null;
  measureSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  measureSvg.setAttribute('class', 'label-measure-svg');
  measureSvg.setAttribute('aria-hidden', 'true');
  document.body.appendChild(measureSvg);
  return measureSvg;
}
