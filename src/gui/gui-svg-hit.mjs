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
  //
  // use is how a shape that must not drift from another one is drawn: the text
  // editor's hit region along a curved label's baseline is a thickened copy of
  // the <defs> path the text is set along. Leaving it out stopped the walk on
  // the band of the label nearest the curve, so a click there reached no
  // feature and the caret stayed where it was -- the lower half of a curved
  // label was unclickable while its text was open for editing.
  function nodeHasSymbolTagType(node) {
    var tag = node.tagName;
    return tag == 'g' || tag == 'tspan' || tag == 'text' || tag == 'image' ||
      tag == 'textPath' || tag == 'path' || tag == 'circle' || tag == 'rect' ||
      tag == 'line' || tag == 'use';
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
