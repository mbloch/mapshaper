import { utils } from './gui-core';
export function isMultilineLabel(textNode) {
  return textNode.childNodes.length > 1;
}

export function toggleTextAlign(textNode, rec) {
  var curr = rec['text-anchor'] || 'middle';
  var value = curr == 'middle' && 'start' || curr == 'start' && 'end' || 'middle';
  updateTextAnchor(value, textNode, rec);
}

// Set an attribute on a <text> node and any child <tspan> elements
// (mapshaper's svg labels require tspans to have the same x and dx values
//  as the enclosing text node)
export function setMultilineAttribute(textNode, name, value) {
  var n = textNode.childNodes.length;
  var i = -1;
  var child;
  textNode.setAttribute(name, value);
  while (++i < n) {
    child = textNode.childNodes[i];
    if (child.tagName == 'tspan') {
      child.setAttribute(name, value);
    }
  }
}

function findSvgRoot(el) {
  while (el && el.tagName != 'html' && el.tagName != 'body') {
    if (el.tagName == 'svg') return el;
    el = el.parentNode;
  }
  return null;
}

// p: pixel coordinates of label anchor
export function autoUpdateTextAnchor(textNode, rec, p) {
  var svg = findSvgRoot(textNode);
  var rect = textNode.getBoundingClientRect();
  var labelCenterX = rect.left - svg.getBoundingClientRect().left + rect.width / 2;
  var xpct = (labelCenterX - p[0]) / rect.width; // offset of label center from anchor center
  var value = xpct < -0.25 && 'end' || xpct > 0.25 && 'start' || 'middle';
  updateTextAnchor(value, textNode, rec);
}

// @value: optional position to set; if missing, auto-set
function updateTextAnchor(value, textNode, rec) {
  var rect = textNode.getBoundingClientRect();
  var width = rect.width;
  var curr = rec['text-anchor'] || 'middle';
  var xshift = 0;

  // console.log("anchor() curr:", curr, "xpct:", xpct, "left:", rect.left, "anchorX:", anchorX, "targ:", targ, "dx:", xshift)
  if (curr == 'middle' && value == 'end' || curr == 'start' && value == 'middle') {
    xshift = width / 2;
  } else if (curr == 'middle' && value == 'start' || curr == 'end' && value == 'middle') {
    xshift = -width / 2;
  } else if (curr == 'start' && value == 'end') {
    xshift = width;
  } else if (curr == 'end' && value == 'start') {
    xshift = -width;
  }
  if (xshift) {
    rec['text-anchor'] = value;
    applyDelta(rec, 'dx', Math.round(xshift));
  }
}

// handle either numeric strings or numbers in fields
export function applyDelta(rec, key, delta) {
  var currVal = rec[key];
  var isString = utils.isString(currVal);
  var newVal = (+currVal + delta) || 0;
  rec[key] = isString ? String(newVal) : newVal;
}
