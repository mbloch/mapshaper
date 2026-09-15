// Finding the knot handle under the pointer.
//
// The hit test reports a feature id and never a part index -- there is a
// standing TODO about it in pointTest() -- so a tool that needs sub-feature
// precision does a second lookup of its own after the hit. findDraggableVertices()
// in gui-draw-lines2.mjs is the line tools' version; this is the label tool's.
//
// Only a selected label's knots are searched, which is what makes this
// unambiguous: hover moved onto the glyphs when path labels stopped being
// reachable by their anchors, so a knot is not a hit target for the feature at
// all. It becomes a grabbable handle exactly when it is drawn as one.
//
// See docs/development/label-tool-design.md.

// The nearest grabbable knot to @p, or null if none is close enough.
//
//   shapes: the display layer's shapes, so that everything here is in display
//     coordinates -- the same space ext.pixCoordsToMapCoords() returns
//   ids: feature ids whose knots are grabbable, i.e. the selection
//   p: pointer position, in display coordinates
//   threshold: how close counts, in display coordinates
//
// Returns {id, index, point}, where point is the knot's own position rather
// than the pointer's -- a drag needs the offset between the two so the knot
// does not jump to the pointer on the first move.
export function findNearestKnot(shapes, ids, p, threshold) {
  var best = null;
  var bestDist = threshold * threshold; // compared squared, so no square roots
  if (!shapes || !ids || !p) return null;
  ids.forEach(function(id) {
    var shp = shapes[id];
    var i, dx, dy, dist;
    if (!shp) return;
    for (i = 0; i < shp.length; i++) {
      dx = shp[i][0] - p[0];
      dy = shp[i][1] - p[1];
      dist = dx * dx + dy * dy;
      // Strictly nearer, so that coincident knots resolve to the lower index
      // rather than depending on iteration order.
      if (dist < bestDist) {
        bestDist = dist;
        best = {id: id, index: i, point: [shp[i][0], shp[i][1]]};
      }
    }
  });
  return best;
}

// Whether moving knot @index of @shp to @p would leave a usable label.
//
// Two knots landing on each other collapse a curve segment to nothing, which
// the fitter cannot take a direction from. Refusing the move is better than
// accepting one that makes the label disappear.
export function knotMoveIsValid(shp, index, p, minDistance) {
  var min = minDistance * minDistance;
  var i, dx, dy;
  if (!shp || !shp[index]) return false;
  if (shp.length < 2) return true; // an anchor has no neighbour to collide with
  for (i = 0; i < shp.length; i++) {
    if (i === index) continue;
    dx = shp[i][0] - p[0];
    dy = shp[i][1] - p[1];
    if (dx * dx + dy * dy < min) return false;
  }
  return true;
}
