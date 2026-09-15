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
export function featureIsLabel(d) {
  return !!d && 'label-text' in d;
}
