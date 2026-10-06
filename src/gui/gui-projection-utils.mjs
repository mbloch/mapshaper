// Tests whether any part of a bounding box can be transformed, by sampling
// a grid of points. (Testing only the center gives false negatives, e.g.
// world-extent data in an orthographic projection centered away from 0,0.)
export function boundsCanBeProjected(bounds, transform, n) {
  var cells = n > 0 ? n : 8;
  var w = bounds.width(), h = bounds.height();
  var x, y, p;
  for (var i = 0; i <= cells; i++) {
    for (var j = 0; j <= cells; j++) {
      x = bounds.xmin + w * i / cells;
      y = bounds.ymin + h * j / cells;
      p = transform(x, y);
      if (p && isFinite(p[0]) && isFinite(p[1])) return true;
    }
  }
  return false;
}
