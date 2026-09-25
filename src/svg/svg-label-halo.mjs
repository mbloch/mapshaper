import { isSvgNumber } from './svg-properties';

// A halo is a stroke around a label's glyphs, painted underneath their fill so
// that it widens the letters' outline without eating into them. Three
// properties describe one, named after the icon-* properties they sit beside
// in the panel:
//
//   halo-width    how far the halo reaches past the edge of the glyphs, in px.
//                 A halo is drawn when this is above 0 and not otherwise.
//   halo-color    defaults to white, the halo nearly every map wants
//   halo-opacity  0-1, apart from the text's own opacity
//
// Not stroke, stroke-width and stroke-opacity, which labels already accept and
// which would then mean two things at once: a label's record styles its icon
// too (see getIconStyleData()), so a halo stored as a stroke would ring the
// symbol as well as the text.
//
// The stroke is twice halo-width because a stroke is centred on the outline:
// the inner half is hidden under the fill, and only the outer half shows.
//
// In the GUI the halo is the text element's own stroke, with paint-order
// putting it underneath. Export draws it as a second copy of the text instead
// -- see splitLabelHalos() -- because Illustrator and Figma ignore paint-order
// when they import SVG and would draw the stroke over the letters.

export var DEFAULT_HALO_COLOR = '#ffffff';
var HALO_PAINT_ORDER = 'stroke fill';

// The properties of the text element that belong to the halo once it has one.
// The label's own stroke properties are among them: a halo is the text's
// stroke, and a dash pattern or a second colour meant for the letters has
// nowhere left to go.
var HALO_STROKE_PROPERTIES = ['stroke', 'stroke-width', 'stroke-opacity',
  'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'paint-order'];

export function labelHasHalo(rec) {
  return !!rec && rec['halo-width'] > 0;
}

// Paints @rec's halo on @o, a rendered <text> element, and returns it.
// Leaves @o alone when the label has no halo, so that labels without one
// render exactly as they did before halos existed.
export function applyLabelHalo(o, rec) {
  var props, opacity;
  if (!labelHasHalo(rec)) return o;
  props = o.properties || (o.properties = {});
  HALO_STROKE_PROPERTIES.forEach(function(k) {
    delete props[k];
  });
  props.stroke = rec['halo-color'] || DEFAULT_HALO_COLOR;
  props['stroke-width'] = rec['halo-width'] * 2;
  opacity = rec['halo-opacity'];
  if (isSvgNumber(opacity) && Number(opacity) < 1) {
    props['stroke-opacity'] = Number(opacity);
  }
  // Round, because the default miter join puts spikes on the sharp corners of
  // letters like M and V, which read as blemishes at any halo width.
  props['stroke-linejoin'] = 'round';
  props['paint-order'] = HALO_PAINT_ORDER;
  return o;
}

// Rewrites every halo'd <text> in @o as a group of two: a stroked copy of the
// text underneath, and the text itself on top with no stroke. Returns @o, or
// the group that replaces it if @o is itself a halo'd label.
//
// The two copies are identical apart from their paint, so they sit in exactly
// the same place whatever the label's position, alignment or path.
//
// The halo copy is unfilled, which matches paint-order, where the fill covers
// the stroke's inner half and nothing else. Its halo-opacity is written as
// opacity rather than stroke-opacity, which Illustrator ignores on import; the
// two look the same on a copy with nothing painted but its stroke.
//
// Illustrator's GPU preview compounds a translucent halo where glyphs
// overlap; its CPU preview and its output do not. Nothing in the SVG was
// found to avoid it: filling the copy (imported as two objects, and no
// better), and putting the opacity on a group or two nested groups around
// the copy, all show the same thing.
//
// Things that apply to the label as a whole move to the group: its transform,
// which places it, and its opacity, which would otherwise fade each copy on its
// own and let the halo show through the letters. That is also how opacity
// reads on a single element with paint-order, which is faded as one image.
export function splitLabelHalos(o) {
  if (!o) return o;
  if (o.tag == 'text' && isHaloText(o)) return splitHalo(o);
  if (o.children) {
    for (var i = 0; i < o.children.length; i++) {
      o.children[i] = splitLabelHalos(o.children[i]);
    }
  }
  return o;
}

function isHaloText(o) {
  return !!o.properties && o.properties['paint-order'] == HALO_PAINT_ORDER;
}

function splitHalo(text) {
  var halo = cloneSvgObject(text);
  var group = {tag: 'g', properties: {}, children: [halo, text]};
  moveProperty(text.properties, group.properties, 'transform');
  moveProperty(text.properties, group.properties, 'opacity');
  delete halo.properties.transform;
  delete halo.properties.opacity;
  delete halo.properties['paint-order'];
  delete halo.properties['fill-opacity'];
  halo.properties.fill = 'none';
  if ('stroke-opacity' in halo.properties) {
    halo.properties.opacity = halo.properties['stroke-opacity'];
    delete halo.properties['stroke-opacity'];
  }
  HALO_STROKE_PROPERTIES.forEach(function(k) {
    delete text.properties[k];
  });
  return group;
}

function moveProperty(src, dest, k) {
  if (k in src) {
    dest[k] = src[k];
    delete src[k];
  }
}

function cloneSvgObject(o) {
  var copy = {tag: o.tag};
  if ('value' in o) copy.value = o.value;
  if (o.properties) copy.properties = Object.assign({}, o.properties);
  if (o.children) copy.children = o.children.map(cloneSvgObject);
  return copy;
}
