import { internal } from './gui-core';

// A point that draws nothing: no symbol, no circle and no label. On its own
// layer it is drawn as a dot, but in a layer of symbols or circles the
// renderers draw only what the records describe, and such a point would
// vanish -- out of sight and out of reach of the tools that could give it a
// symbol. The GUI draws it with this marker instead. Export does not.
export var UNSTYLED_POINT_MARKER = {
  radius: 2.5,
  fill: '#223',
  stroke: '#fff',
  strokeWidth: 1
};

export function pointIsUnstyled(rec) {
  return !internal.svg.featureHasSvgSymbol(rec) && !internal.svg.featureIsLabel(rec);
}

export function renderUnstyledPointMarker() {
  var m = UNSTYLED_POINT_MARKER;
  return {
    tag: 'circle',
    properties: {
      class: 'unstyled-point-marker',
      cx: 0, cy: 0, r: m.radius,
      fill: m.fill, stroke: m.stroke, 'stroke-width': m.strokeWidth
    }
  };
}
