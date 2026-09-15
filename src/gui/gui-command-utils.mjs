// Quotes a value for use in a mapshaper command string.
//
// Single quotes with backslash escaping is what the command parser expects;
// this round-trips text containing apostrophes, double quotes, spaces and the
// empty string. Extracted here because three style tools had defined it
// privately and the label tool needed a fourth copy.
export function quoteCommandValue(str) {
  return "'" + String(str).replace(/'/g, "\\'") + "'";
}
