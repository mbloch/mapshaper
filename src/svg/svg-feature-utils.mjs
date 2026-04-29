// Tiny predicates for inspecting SVG-bound feature records. Extracted so
// that svg-symbols.mjs can use them without having to import from the
// higher-level mapshaper-svg.mjs (which would otherwise form a cycle).

export function featureHasSvgSymbol(d) {
  return !!(d && (d['svg-symbol'] || d.r));
}

export function featureHasLabel(d) {
  var text = d && d['label-text'];
  return text || text === 0; // accept numerical 0 as label text
}
