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
