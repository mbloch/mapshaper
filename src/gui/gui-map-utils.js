import { utils, Bounds } from './gui-core';

// Test if map should be re-framed to show updated layer
export function mapNeedsReset(newBounds, prevBounds, viewportBounds, flags) {
  var viewportPct = getIntersectionPct(newBounds, viewportBounds);
  var contentPct = getIntersectionPct(viewportBounds, newBounds);
  var boundsChanged = !prevBounds.equals(newBounds);
  var inView = newBounds.intersects(viewportBounds);
  var areaChg = newBounds.area() / prevBounds.area();
  var chgThreshold = flags.proj ? 1e3 : 1e8;
  // don't reset if layer extent hasn't changed
  if (!boundsChanged) return false;
  // reset if layer is out-of-view
  if (!inView) return true;
  // reset if content is mostly offscreen
  if (viewportPct < 0.3 && contentPct < 0.9) return true;
  // reset if content bounds have changed a lot (e.g. after projection)
  if (areaChg > chgThreshold || areaChg < 1/chgThreshold) return true;
  return false;
}

// Returns proportion of bb2 occupied by bb1
function getIntersectionPct(bb1, bb2) {
  return getBoundsIntersection(bb1, bb2).area() / bb2.area() || 0;
}

function getBoundsIntersection(a, b) {
  var c = new Bounds();
  if (a.intersects(b)) {
    c.setBounds(Math.max(a.xmin, b.xmin), Math.max(a.ymin, b.ymin),
    Math.min(a.xmax, b.xmax), Math.min(a.ymax, b.ymax));
  }
  return c;
}
