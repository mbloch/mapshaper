// The pattern fill controls of the polygon panel, and the fill-pattern codes
// they stand for.
//
// The panel covers the patterns that are one colour over a background: hatch
// lines, dots and squares. The background is the feature's own fill, so a
// pattern is described by five settings -- {type, color, size, gap, angle} --
// and the fill. A hatch has no background in the code: it is a run of stripes,
// and the panel's hatch is two of them, the gap in the fill colour and the line
// in the pattern colour. Anything else (dashes, several colours, a background
// that is not the fill) is a custom pattern, which the panel shows as its code.
//
// Written into every code rather than read from the fill when drawn, because
// the code is what -style stores and what the SVG exporter turns into a
// <pattern>: a pattern with no colour of its own would need both to change.

export var patternTypes = ['hatches', 'dots', 'squares'];

var patternDefaults = {
  hatches: {size: 1, gap: 3, angle: 45},
  dots: {size: 2, gap: 3, angle: 0},
  squares: {size: 2, gap: 2, angle: 0}
};

export var defaultPatternColor = '#000000';

// The settings a newly chosen pattern type starts from. The colour carries
// over from the pattern being replaced; the sizes do not, because a hatch
// line's width and a dot's diameter look nothing alike at the same number.
export function getDefaultPatternControls(type, color) {
  var d = patternDefaults[type];
  return {type: type, color: color || defaultPatternColor,
    size: d.size, gap: d.gap, angle: d.angle};
}

// The background a pattern is given over a feature with @fill. A feature with
// no fill gets a clear one, so that the pattern is drawn over whatever is
// underneath.
export function getPatternBackground(fill) {
  return isBlank(fill) ? 'none' : String(fill).trim();
}

// Whether the settings describe a pattern the renderer will draw. A hatch with
// no gap would be a solid fill, and the parser refuses a stripe of no width.
export function isValidPatternControls(o) {
  if (!o || patternTypes.indexOf(o.type) == -1 || isBlank(o.color)) return false;
  if (!(o.size > 0) || !isFinite(o.angle)) return false;
  return o.type == 'hatches' ? o.gap > 0 : o.gap >= 0;
}

// The fill-pattern code for the settings @o over @background. The angle is left
// out where it is the parser's own default, which keeps the common codes as
// short as the ones in the documentation.
export function formatFillPattern(o, background) {
  var bg = background || 'none';
  if (o.type == 'hatches') {
    return 'hatches ' + formatAngle(o.angle, 45) +
      formatPx(o.gap) + ' ' + bg + ' ' + formatPx(o.size) + ' ' + o.color;
  }
  return o.type + ' ' + formatAngle(o.angle, 0) +
    formatPx(o.size) + ' ' + o.color + ' ' + formatPx(o.gap) + ' ' + bg;
}

// The settings a parsed fill-pattern code (from parsePattern()) was made from,
// given the fill of the feature it is on -- or null if the panel's settings
// cannot describe it, which makes it a custom pattern.
export function getPatternControls(parsed, fill) {
  var bg = getPatternBackground(fill);
  var line;
  if (!parsed) return null;
  if (parsed.type == 'hatches') {
    if (parsed.widths.length != 2) return null;
    line = sameColor(parsed.colors[0], bg) ? 1 : sameColor(parsed.colors[1], bg) ? 0 : -1;
    if (line == -1) return null;
    return {type: 'hatches', color: parsed.colors[line], size: parsed.widths[line],
      gap: parsed.widths[1 - line], angle: parsed.rotation};
  }
  if (parsed.type == 'dots' || parsed.type == 'squares') {
    if (parsed.colors.length != 1 || !sameColor(parsed.background, bg)) return null;
    return {type: parsed.type, color: parsed.colors[0], size: parsed.size,
      gap: parsed.spacing, angle: parsed.rotation};
  }
  return null;
}

// The same pattern over a different fill, or null for a custom pattern, which
// is left as it is.
export function refillPattern(parsed, oldFill, newFill) {
  var o = getPatternControls(parsed, oldFill);
  return o ? formatFillPattern(o, getPatternBackground(newFill)) : null;
}

// A -style expression giving each feature the pattern @o over its own fill.
// For a change that sets fills the panel cannot know in advance, like
// -classify's random colours.
export function formatFillPatternExpression(o) {
  var sentinel = '\u0000';
  var parts = formatFillPattern(o, sentinel).split(sentinel);
  return JSON.stringify(parts[0]) + ' + (fill || "none") + ' + JSON.stringify(parts[1]);
}

// Collects per-feature edits into as few -style commands as they allow.
// @edits: [{id, styles: [[name, value], ...]}]
// Returns [{styles, ids}], in the order each set of styles first appears.
export function groupStyleEdits(edits) {
  var groups = [];
  var index = {};
  edits.forEach(function(edit) {
    var key = JSON.stringify(edit.styles);
    if (!(key in index)) {
      index[key] = groups.length;
      groups.push({styles: edit.styles, ids: []});
    }
    groups[index[key]].ids.push(edit.id);
  });
  return groups;
}

function formatAngle(angle, defaultAngle) {
  return angle == defaultAngle ? '' : formatNumber(angle) + 'deg ';
}

function formatPx(val) {
  return formatNumber(val) + 'px';
}

function formatNumber(val) {
  return String(Math.round(Number(val) * 100) / 100);
}

function sameColor(a, b) {
  return normalizeColor(a) == normalizeColor(b);
}

function normalizeColor(color) {
  var str = String(color || '').trim().toLowerCase();
  return str == 'transparent' ? 'none' : str;
}

function isBlank(val) {
  return val === undefined || val === null || String(val).trim() === '';
}
