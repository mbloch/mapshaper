// Conversions between what a style control displays and what the property
// stores, for the ones more than one panel needs.

// The fraction an opacity control's contents mean ("50%", " 50 " -> 0.5), or
// null if it is not holding a number. Out-of-range values are clamped rather
// than refused: a pasted 150% is an intent, not a mistake.
export function parseOpacityValue(str) {
  var pct = Number(String(str).replace('%', '').trim());
  if (!isFinite(pct)) return null;
  return Math.max(0, Math.min(100, pct)) / 100;
}

// A typed dash pattern in the form -style stroke-dasharray= takes: lengths
// separated by single spaces. Commas and runs of whitespace are accepted
// because SVG accepts them, and a pasted "4, 2" means the same as "4 2".
// Returns '' for a blank field. Does not check that the lengths are numbers.
export function normalizeDashArrayInput(str) {
  return String(str).trim().split(/[\s,]+/).filter(Boolean).join(' ');
}

// A stored fraction as the percentage a control shows, or '' for no value --
// which is how a control over a selection that does not agree shows.
export function formatOpacityPct(val) {
  val = Number(val);
  return isFinite(val) ? Math.round(Math.max(0, Math.min(1, val)) * 100) + '%' : '';
}
