/* @requires mapshaper-svg-symbols */


function isMultilineLabel(textNode) {
  return textNode.childNodes.length > 1;
}

function toggleTextAlign(textNode, rec) {
  var curr = rec['text-anchor'] || 'middle';
  var targ = curr == 'middle' && 'start' || curr == 'start' && 'end' || 'middle';
  updateTextAnchor(textNode, rec, targ);
}

// Set an attribute on a <text> node and any child <tspan> elements
// (mapshaper's svg labels require tspans to have the same x and dx values
//  as the enclosing text node)
function setMultilineAttribute(textNode, name, value) {
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

// @value: optional position to set; if missing, auto-set
function updateTextAnchor(textNode, rec, value) {
  var rect = textNode.getBoundingClientRect();
  var width = rect.width;
  var anchorX = +textNode.getAttribute('x');
  var labelCenterX = rect.left - findSvgRoot(textNode).getBoundingClientRect().left + width / 2;
  var xpct = (labelCenterX - anchorX) / width; // offset of label center from anchor center
  var curr = rec['text-anchor'] || 'middle';
  var xshift = 0;
  var targ = value || xpct < -0.25 && 'end' || xpct > 0.25 && 'start' || 'middle';
  if (curr == 'middle' && targ == 'end' || curr == 'start' && targ == 'middle') {
    xshift = width / 2;
  } else if (curr == 'middle' && targ == 'start' || curr == 'end' && targ == 'middle') {
    xshift = -width / 2;
  } else if (curr == 'start' && targ == 'end') {
    xshift = width;
  } else if (curr == 'end' && targ == 'start') {
    xshift = -width;
  }
  if (xshift) {
    rec['text-anchor'] = targ;
    applyDelta(rec, 'dx', xshift);
  }
}

// handle either numeric strings or numbers in fields
function applyDelta(rec, key, delta) {
  var currVal = rec[key];
  var isString = utils.isString(currVal);
  var newVal = (+currVal + delta) || 0;
  rec[key] = isString ? String(newVal) : newVal;
}