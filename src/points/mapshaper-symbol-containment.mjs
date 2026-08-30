import { testPointInPolygon } from '../geom/mapshaper-polygon-geom';
import { PathIndex } from '../paths/mapshaper-path-index';

// Keeps each symbol's center inside the polygon that contained it to begin
// with, so that a symbol representing one area can't drift into a neighboring
// one. Used by -repel via its polygons= option.
//
// Nodes are laid out in pixel space, at a scale of @pixelsPerUnit pixels per
// unit of the polygons' coordinate system. That transform is a pure scale (see
// how -repel builds its nodes), so dividing a node position by it gives a
// position that can be tested against the polygons directly.

// Bisection steps used to find how far a symbol can travel before it leaves its
// polygon. Six steps locate the crossing to within 1/64 of the attempted move;
// finer searches were measured and change the result by a fraction of a pixel.
var BISECT_STEPS = 6;

// Assigns each node the id of the polygon containing its anchor, or -1 if the
// anchor isn't inside any of them. Returns the number of unassigned nodes,
// which are left free to move.
export function assignContainingPolygons(nodes, lyr, arcs, pixelsPerUnit) {
  var index = new PathIndex(lyr.shapes, arcs);
  var unassigned = 0;
  nodes.forEach(function(node) {
    node.polygonId = index.findEnclosingShape([node.x0 / pixelsPerUnit, node.y0 / pixelsPerUnit]);
    node.insideX = node.x0;
    node.insideY = node.y0;
    if (node.polygonId == -1) unassigned++;
  });
  return unassigned;
}

// Returns a function that the solver runs after each pass: any symbol that has
// left its polygon is pulled back along the path it just travelled, to the
// furthest point that is still inside.
//
// This can't violate the max-shift limit. The position it assigns always lies
// between two positions the node has already held, both of which the solver
// clamped to within max-shift of the anchor, and a disk is convex.
export function getContainmentConstraint(lyr, arcs, pixelsPerUnit) {
  var shapes = lyr.shapes;

  function isInside(node, x, y) {
    return testPointInPolygon(x / pixelsPerUnit, y / pixelsPerUnit,
      shapes[node.polygonId], arcs);
  }

  return function(nodes) {
    var node, lo, hi, mid, x, y, i, j;
    for (i=0; i<nodes.length; i++) {
      node = nodes[i];
      if (node.polygonId == -1) continue;
      // A node that hasn't moved since it was last checked is still inside,
      // so most symbols in a sparse layout cost nothing after the early passes
      if (node.x === node.insideX && node.y === node.insideY) continue;
      if (isInside(node, node.x, node.y)) {
        node.insideX = node.x;
        node.insideY = node.y;
        continue;
      }
      lo = 0; // known inside
      hi = 1; // known outside
      for (j=0; j<BISECT_STEPS; j++) {
        mid = (lo + hi) / 2;
        x = node.insideX + (node.x - node.insideX) * mid;
        y = node.insideY + (node.y - node.insideY) * mid;
        if (isInside(node, x, y)) lo = mid; else hi = mid;
      }
      node.x = node.insideX + (node.x - node.insideX) * lo;
      node.y = node.insideY + (node.y - node.insideY) * lo;
      node.insideX = node.x;
      node.insideY = node.y;
    }
  };
}
