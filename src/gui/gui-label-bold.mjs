import { internal } from './gui-core';

// The bold stretches of a label being edited, as [start, end) offsets into the
// text the user edits, and how they follow the text as it changes.
//
// The editor keeps these beside the textarea's value rather than as markup in
// it, so that the caret and the selection index the text the user sees. The
// markup they come from and go back to is read and written by
// readLabelValue() and writeLabelValue() in gui-label-text.mjs.
//
// Every function returns a new, normalized list -- sorted, non-empty, and with
// no two ranges touching -- and leaves its argument alone.

export function isBoldAt(ranges, i) {
  for (var j = 0; j < ranges.length; j++) {
    if (i >= ranges[j][0] && i < ranges[j][1]) return true;
  }
  return false;
}

// Whether every character in [start, end) is bold. False for an empty range.
export function rangeIsAllBold(ranges, start, end) {
  var pos = start;
  if (!(end > start)) return false;
  for (var j = 0; j < ranges.length && pos < end; j++) {
    if (ranges[j][1] <= pos) continue;
    if (ranges[j][0] > pos) return false;
    pos = ranges[j][1];
  }
  return pos >= end;
}

// [start, end) set bold (@on) or not.
export function setBoldRange(ranges, start, end, on) {
  var out = [];
  ranges.forEach(function(r) {
    if (r[1] <= start || r[0] >= end) {
      out.push([r[0], r[1]]);
      return;
    }
    if (r[0] < start) out.push([r[0], start]);
    if (r[1] > end) out.push([end, r[1]]);
  });
  if (on && end > start) out.push([start, end]);
  return normalize(out);
}

// What pressing Bold does to [start, end): unbolds a range that is all bold
// and bolds any other, including one that is partly bold -- the convention of
// every word processor, and the reading that leaves the range one weight.
export function toggleBoldRange(ranges, start, end) {
  return setBoldRange(ranges, start, end, !rangeIsAllBold(ranges, start, end));
}

// The ranges for @newText, given the ranges they were for @oldText.
//
// The edit is found as the text between the longest common prefix and suffix,
// which is exact for everything a textarea does in one step -- typing,
// deleting, pasting over a selection, an IME composition -- and still gives a
// sensible answer for its own undo, which can replace a larger stretch at once.
//
// Inserted text takes the weight of the character before it, so typing on at
// the end of a bold word stays bold and typing after it does not; at the start
// of the text it takes the weight of the first character.
export function updateBoldForEdit(ranges, oldText, newText) {
  var edit, inherit, mapped;
  if (ranges.length === 0 || oldText === newText) return normalize(ranges);
  edit = findEdit(oldText, newText);
  inherit = edit.start > 0 ? isBoldAt(ranges, edit.start - 1) :
    isBoldAt(ranges, edit.start + edit.removed);
  mapped = ranges.map(function(r) {
    return [mapOffset(r[0], edit), mapOffset(r[1], edit)];
  });
  return setBoldRange(normalize(mapped), edit.start, edit.start + edit.inserted,
    inherit);
}

export function sameBoldRanges(a, b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
  }
  return true;
}

// {start, removed, inserted}: characters [start, start + removed) of the old
// text became [start, start + inserted) of the new one.
function findEdit(a, b) {
  var max = Math.min(a.length, b.length);
  var pre = 0, suf = 0;
  while (pre < max && a.charCodeAt(pre) === b.charCodeAt(pre)) pre++;
  while (suf < max - pre &&
    a.charCodeAt(a.length - 1 - suf) === b.charCodeAt(b.length - 1 - suf)) suf++;
  return {start: pre, removed: a.length - pre - suf, inserted: b.length - pre - suf};
}

// A boundary inside the removed stretch collapses to its start. One after it
// moves by the change in length.
function mapOffset(x, edit) {
  if (x <= edit.start) return x;
  if (x >= edit.start + edit.removed) return x - edit.removed + edit.inserted;
  return edit.start;
}

function normalize(ranges) {
  return internal.svg.normalizeBoldRanges(ranges);
}
