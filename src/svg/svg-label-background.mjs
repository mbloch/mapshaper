import { getLabelBox } from './svg-label-callout';
import { labelHasBackground } from './svg-label-box';
import { isSvgNumber } from './svg-properties';
import { roundToTenths } from '../geom/mapshaper-rounding';

// A fill behind an anchored label's text, covering its box: the text and its
// label-padding. Two properties describe one:
//
//   label-background          the fill colour. A background is drawn when
//                             this is set, and not when it is unset or "none".
//   label-background-opacity  0-1, apart from the text's own opacity
//
// Drawn as a <rect> in the label's own space, beneath the text, its icon and
// its callout. The rectangle's size is fixed when it is drawn, from the
// measured width of the text and a height estimated from the font size and line
// height -- see getLabelTextBox(). An SVG opened where the label's font is
// missing draws the text in another one, and the box no longer fits it.
//
// Opacity is written as opacity rather than fill-opacity, for the reason the
// halo's is: see splitLabelHalos().

// The background of @rec as an SVG object, or null if it has none
export function renderLabelBackground(rec) {
  var box, w, h, props, opacity;
  if (!labelHasBackground(rec)) return null;
  box = getLabelBox(rec, {estimate_width: true});
  w = box.xmax - box.xmin;
  h = box.ymax - box.ymin;
  if (!(w > 0) || !(h > 0)) return null;
  props = {
    class: 'label-background',
    x: roundToTenths(box.xmin),
    y: roundToTenths(box.ymin),
    width: roundToTenths(w),
    height: roundToTenths(h),
    fill: String(rec['label-background']).trim()
  };
  opacity = rec['label-background-opacity'];
  if (isSvgNumber(opacity) && Number(opacity) < 1) {
    props.opacity = Math.max(0, Number(opacity));
  }
  return {tag: 'rect', properties: props};
}
