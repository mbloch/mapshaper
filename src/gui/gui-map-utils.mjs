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

// Test if an update may have affected the visible shape of arcs
// @flags Flags from update event
export function arcsMayHaveChanged(flags) {
  return flags.simplify_method || flags.simplify || flags.proj ||
    flags.arc_count || flags.repair || flags.clip || flags.erase ||
    flags.slice || flags.affine || flags.rectangle || flags.buffer ||
    flags.union || flags.mosaic || flags.snap || flags.clean || flags.drop || false;
}

// check for operations that may change the number of self intersections in the
// target layer.
export function intersectionsMayHaveChanged(flags) {
  return arcsMayHaveChanged(flags) || flags.select || flags['merge-layers'] ||
  flags.filter || flags.dissolve || flags.dissolve2;
}

// Test if an update allows hover popup to stay open
export function popupCanStayOpen(flags) {
  // keeping popup open after -drop geometry causes problems...
  // // if (arcsMayHaveChanged(flags)) return false;
  if (arcsMayHaveChanged(flags)) return false;
  if (flags.points || flags.proj) return false;
  if (!flags.same_table) return false;
  return true;
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
