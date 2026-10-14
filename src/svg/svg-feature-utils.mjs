// Tiny predicates for inspecting SVG-bound feature records. Extracted so
// that svg-symbols.mjs can use them without having to import from the
// higher-level mapshaper-svg.mjs (which would otherwise form a cycle).

export function featureHasSvgSymbol(d) {
  return !!(d && (d['svg-symbol'] || d.r || d.icon || d['icon-size']));
}

export function featureHasLabel(d) {
  var text = d && d['label-text'];
  return text || text === 0; // accept numerical 0 as label text
}

// Whether a feature is a label at all, including one whose text is still empty.
//
// The GUI needs this and export does not. A label is a label from the moment it
// is created, before anything has been typed into it, and the editor has to
// render a node for it: with no node there is nothing to see, nothing to click
// and nowhere to put a caret, so a label the user just made would be invisible
// and unrecoverable. Export has no editor and drops the empty ones.
//
// A label is created with its text, or with '' when the GUI is about to type
// into it. A symbol merged into a layer of labels is given the field with no
// value at all, which does not make it a label. A curve symbol (icon=curve)
// without text is not a label even with '' in the field, which a format with no
// way to leave a value out writes.
export function featureIsLabel(d) {
  var text = d ? d['label-text'] : undefined;
  if (text === undefined || text === null) return false;
  return d.icon != 'curve' || !!featureHasLabel(d);
}

// A numbered marker: a circle or a square with a number or a letter centred
// on it, as in "1, 2, 3" on a route map. It is a label to the commands and the
// renderer, and a symbol to the GUI, whose symbol tool edits it. Recognized by
// its fields rather than marked with a field of its own, so that a marker
// written by -labels on the command line is one too.
export function featureIsMarker(d) {
  return !!featureHasLabel(d) && d['label-pos'] == 'c' &&
    (d.icon == 'circle' || d.icon == 'square');
}

// A label that the GUI's label tool edits: any label but a marker.
export function featureIsTextLabel(d) {
  return featureIsLabel(d) && !featureIsMarker(d);
}

// A curve symbol: a smooth path through the feature's points (its knots),
// rather than a symbol at each point. A curve with label text is a path label.
export function featureIsCurve(d) {
  return !!d && d.icon == 'curve' && !featureHasLabel(d);
}
