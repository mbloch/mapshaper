import { getSymbolNodeId } from './gui-svg-symbols';

export function getSvgHitTest(displayLayer) {

  return function(pointerEvent) {
    // target could be a part of an SVG symbol, or the SVG element, or something else
    var target = pointerEvent.originalEvent.target;
    var symbolNode = getSymbolNode(target);
    if (!symbolNode) {
      return null;
    }
    return {
      targetId: getSymbolNodeId(symbolNode), // TODO: some validation on id
      targetSymbol: symbolNode,
      targetNode: target,
      container: symbolNode.parentNode
    };
  };

  // target: event target (could be any DOM element)
  function getSymbolNode(target) {
    var node = target;
    while (node && nodeHasSymbolTagType(node)) {
      if (isSymbolNode(node)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  // TODO: switch to attribute detection
  //
  // textPath is what the pointer lands on over the glyphs of a path-aligned
  // label, and its omission made those glyphs unhoverable: the walk stopped at
  // the first unlisted tag, one step short of the <text> that carries the id.
  function nodeHasSymbolTagType(node) {
    var tag = node.tagName;
    return tag == 'g' || tag == 'tspan' || tag == 'text' || tag == 'image' ||
      tag == 'textPath' || tag == 'path' || tag == 'circle' || tag == 'rect' ||
      tag == 'line';
  }

  function isSymbolNode(node) {
    return node.hasAttribute('data-id') && (node.tagName == 'text' || node.tagName == 'g');
  }

  function isSymbolChildNode(node) {

  }

  function getChildId(childNode) {

  }

  function getSymbolId(symbolNode) {

  }

  function getFeatureId(symbolNode) {

  }

}
