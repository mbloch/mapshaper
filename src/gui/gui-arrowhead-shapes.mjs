// The heads a line can end in, and their button glyphs: shared by the label
// callout's End buttons, the layer panel's Arrowheads section and the symbol
// tool's curve section, so that a head looks the same wherever it is chosen.
//
// The glyphs point left, the way a line's start head and a callout's anchor
// end do, and are drawn to the renderer's angles, with sides the same visible
// length -- the open one's stroke included -- so that they compare as the
// drawn heads do. The dot's left edge is where the arrows' tips are.

export var ARROWHEAD_SHAPES = [{
  name: 'arrow',
  title: 'solid arrowheads'
}, {
  name: 'wide-arrow',
  title: 'wide solid arrowheads'
}, {
  name: 'open-arrow',
  title: 'open arrowheads'
}, {
  name: 'dot',
  title: 'dots'
}];

export var ARROWHEAD_GLYPHS = {
  arrow: '<path d="M6.84 8H13"></path><path class="fill" d="M2.5 8L8.7 6.05V9.95Z"></path>',
  'wide-arrow': '<path d="M6.44 8H13"></path><path class="fill" d="M2.5 8L8.13 4.75V11.25Z"></path>',
  'open-arrow': '<path d="M3.2 8H13"></path><path d="M7.38 5.07L3.2 8L7.38 10.93"></path>',
  dot: '<path d="M5 8H13"></path><circle class="fill" cx="5" cy="8" r="2.6"></circle>'
};

export function getArrowheadGlyph(name) {
  return '<svg class="label-callout-symbol" viewBox="0 0 16 16" aria-hidden="true">' +
    (ARROWHEAD_GLYPHS[name] || '') + '</svg>';
}
