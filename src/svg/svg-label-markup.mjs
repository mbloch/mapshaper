// Bold words inside a label: label-text='Israel <b>restricted access</b> here'.
//
// The markup is part of the text rather than a column beside it, so that the
// words and their weight cannot drift apart: an expression, a join or a -labels
// text= that rewrites the text rewrites the bold with it. The GUI editor never
// shows the tags -- it reads them into ranges and writes them back.
//
// Only a matched <b>...</b> pair with no other b tag inside it is markup.
// Anything else -- an unclosed <b>, a stray </b>, "a < b" -- is text, and is
// drawn as typed.
//
// See docs/development/label-tool-design.md.

var BOLD_PAIR_RXP = /<b>((?:(?!<\/?b>)[\s\S])*?)<\/b>/gi;
var BOLD_TAG_RXP = /<\/?b>/i;

// The font-weight a bold run is drawn with: the keyword, which a browser and
// the Node text measurer both resolve to the family's own bold face.
export var LABEL_BOLD_WEIGHT = 'bold';

// @str -> {text, bold}: the text with its bold pairs removed, and the bold
// stretches as ascending, non-overlapping [start, end) offsets into it.
export function parseBoldMarkup(str) {
  var s = str === null || str === undefined ? '' : String(str);
  var text = '', bold = [], last = 0, m;
  if (!BOLD_TAG_RXP.test(s)) return {text: s, bold: bold};
  BOLD_PAIR_RXP.lastIndex = 0;
  while ((m = BOLD_PAIR_RXP.exec(s))) {
    text += s.substring(last, m.index);
    if (m[1]) {
      bold.push([text.length, text.length + m[1].length]);
      text += m[1];
    }
    last = m.index + m[0].length;
  }
  text += s.substring(last);
  return {text: text, bold: normalizeBoldRanges(bold)};
}

export function stripBoldMarkup(str) {
  return parseBoldMarkup(str).text;
}

// Sorted, clipped to non-empty, with touching and overlapping ranges merged.
// Returns a new array.
export function normalizeBoldRanges(ranges) {
  var sorted = (ranges || []).filter(function(r) {
    return r && r[1] > r[0];
  }).map(function(r) {
    return [r[0], r[1]];
  }).sort(function(a, b) {
    return a[0] - b[0];
  });
  var out = [];
  sorted.forEach(function(r) {
    var prev = out[out.length - 1];
    if (prev && r[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], r[1]);
    } else {
      out.push(r);
    }
  });
  return out;
}

// The characters [start, end) of @text as runs of one weight:
// [{text, bold}, ...], with nothing for an empty stretch.
export function getBoldRuns(text, bold, start, end) {
  var runs = [], pos = start, i, r, a, b;
  for (i = 0; i < bold.length && pos < end; i++) {
    r = bold[i];
    a = Math.max(r[0], pos);
    b = Math.min(r[1], end);
    if (b <= a) continue;
    if (a > pos) runs.push({text: text.substring(pos, a), bold: false});
    runs.push({text: text.substring(a, b), bold: true});
    pos = b;
  }
  if (pos < end) runs.push({text: text.substring(pos, end), bold: false});
  return runs;
}

// @runs -> @obj with the first plain run as its value and the rest as <tspan>s,
// which is the shape the stringifier writes as mixed content. A label with no
// bold in it comes out exactly as it did before bold existed: one value and no
// children. Returns @obj.
export function applyRunsToSvgObject(obj, runs) {
  var i = 0;
  var children = [];
  if (runs.length > 0 && !runs[0].bold) {
    obj.value = runs[0].text;
    i = 1;
  } else {
    obj.value = '';
  }
  for (; i < runs.length; i++) {
    children.push(renderRun(runs[i]));
  }
  if (children.length > 0) {
    obj.children = children.concat(obj.children || []);
  }
  return obj;
}

function renderRun(run) {
  var o = {tag: 'tspan', value: run.text};
  if (run.bold) o.properties = {'font-weight': LABEL_BOLD_WEIGHT};
  return o;
}
