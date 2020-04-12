
export var symbolBuilders = {};
export var symbolRenderers = {};

export function getTransform(xy, scale) {
  var str = 'translate(' + xy[0] + ' ' + xy[1] + ')';
  if (scale && scale != 1) {
    str += ' scale(' + scale + ')';
  }
  return str;
}
