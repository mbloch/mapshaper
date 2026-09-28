// Conversions between what a style control displays and what the property
// stores, for the ones more than one panel needs.

// The fraction an opacity control's contents mean ("50%", " 50 " -> 0.5), or
// null if it is not holding a number. Out-of-range values are clamped rather
// than refused: a pasted 150% is an intent, not a mistake. A blank field is
// null, not zero: it is what a colour with no value shows beside it.
export function parseOpacityValue(str) {
  var txt = String(str).replace('%', '').trim();
  var pct = Number(txt);
  if (txt === '' || !isFinite(pct)) return null;
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
  if (isUnsetValue(val)) return '';
  val = Number(val);
  return isFinite(val) ? Math.round(Math.max(0, Math.min(1, val)) * 100) + '%' : '';
}

// The opacity shown beside a colour. A colour with no opacity of its own is
// drawn opaque, and says so; with no colour either, there is nothing for an
// opacity to apply to, and the field is blank like the colour.
export function formatColorOpacityPct(opacity, hasColor) {
  if (isUnsetValue(opacity)) return hasColor ? '100%' : '';
  return formatOpacityPct(opacity);
}

function isUnsetValue(val) {
  return val === undefined || val === null || val === '';
}
