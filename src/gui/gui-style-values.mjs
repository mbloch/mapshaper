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

// A stored fraction as the percentage a control shows, or '' for no value --
// which is how a control over a selection that does not agree shows.
export function formatOpacityPct(val) {
  val = Number(val);
  return isFinite(val) ? Math.round(Math.max(0, Math.min(1, val)) * 100) + '%' : '';
}
