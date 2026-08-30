// Collision reduction for circular symbols, in the spirit of d3-force's
// forceCollide. Overlapping symbols are pushed apart, but each one is kept
// within a fixed distance of its true position.
//
// Ported from the vmap library, which uses this solver instead of d3-force to
// keep its layouts repeatable: forceCollide()'s jiggle() calls Math.random(),
// so identical input produces different output on every run. Mapshaper needs
// the same guarantee, so this solver avoids Math.random() and trigonometry,
// whose results are either unrepeatable or unspecified across JS engines.
//
// Nodes are laid out in pixel space; converting to and from map coordinates is
// the caller's job. A node is {i, x, y, x0, y0, r, maxShift}, where x0,y0 is
// the anchor (the symbol's true position), r includes any padding and maxShift
// is the furthest this symbol may be displaced. Both r and maxShift are
// per-node, so the caller can vary them from symbol to symbol; a node with a
// maxShift of 0 never moves and so acts as a fixed obstacle.

// max_shift is not read by the solver (it is a per-node property); it is here
// as the default for callers to apply when building nodes.
//
// strength is the damping factor of what is essentially Gauss-Seidel
// relaxation. A symbol in a cluster is corrected once per overlapping neighbor
// in a single pass, so the corrections sum to more than its own overlap and
// values near 1 overshoot and oscillate. Given the tick budget below, anything
// from 0.3 to 1.0 resolves a layout that can be resolved at all; the value only
// matters where crowding exceeds what max-shift can fix, and there the lower
// end leaves shallower overlaps and holds symbols closer to their true
// positions. Below about 0.4 the solver stops reliably breaking up stacks of
// coincident symbols.
export var symbolCollisionDefaults = {
  ticks: 100,
  max_shift: 12,
  strength: 0.4
};

// Mutates the x,y properties of @nodes. Returns the number of nodes that moved.
//
// opts.constrain is an optional function(nodes) applied after each pass, for
// callers that need to restrict where symbols may go (see
// mapshaper-symbol-containment.mjs). It must only move a node to a position
// between ones the node has already held, or the max-shift limit no longer
// holds.
export function resolveSymbolCollisions(nodes, opts) {
  var ticks = opts.ticks,
      strength = opts.strength,
      constrain = opts.constrain || null,
      moved = 0,
      i;
  if (nodes.length < 2 || !(ticks > 0) || !anyNodeCanMove(nodes)) return 0;
  for (i=0; i<ticks; i++) {
    resolveCollisions(nodes, strength);
    // Limiting the displacement on every pass (instead of only at the end)
    // avoids pulling symbols back into the overlaps they just escaped.
    limitDisplacement(nodes);
    if (constrain) constrain(nodes);
  }
  for (i=0; i<nodes.length; i++) {
    if (nodes[i].x !== nodes[i].x0 || nodes[i].y !== nodes[i].y0) moved++;
  }
  return moved;
}

// Overlaps shallower than this are not reported. A converged layout doesn't
// leave symbols exactly touching, it leaves a tail of overlaps a fraction of a
// pixel deep -- on a solved 435-symbol layout, 55 pairs overlap by more than a
// hundredth of a pixel, 6 by more than half a pixel, and none by more than one.
// So a threshold of a pixel is where this solver's convergence residue ends and
// genuine unresolved crowding begins, as well as being about the point where an
// overlap becomes visible.
export var VISIBLE_OVERLAP = 1; // pixels

// Number of visibly overlapping pairs, for reporting how much of the job got
// done. Deliberately not a count of all overlaps: an overlap 100th of a pixel
// deep and one 15 pixels deep are not the same result, and treating them alike
// makes a layout that is visually finished look like a failure.
export function countSymbolCollisions(nodes) {
  var count = 0;
  forEachCollision(nodes, function(a, b, dx, dy, distSq, sum) {
    if (sum - Math.sqrt(distSq) > VISIBLE_OVERLAP) count++;
  });
  return count;
}

// Push overlapping nodes apart, in proportion to the overlap. Larger nodes move
// less than smaller ones.
function resolveCollisions(nodes, strength) {
  forEachCollision(nodes, function(a, b, dx, dy, distSq, sum) {
    separate(a, b, dx, dy, distSq, sum, strength);
  });
}

// Sweep along the x axis, using the largest radius still ahead of the current
// node to know when to stop looking for neighbors.
function forEachCollision(nodes, cb) {
  var n = nodes.length,
      maxAhead = new Float64Array(n),
      max = 0,
      a, b, dx, dy, sum, distSq, i, j;
  nodes.sort(compareX);
  for (i=n-1; i>=0; i--) {
    if (nodes[i].r > max) max = nodes[i].r;
    maxAhead[i] = max;
  }
  for (i=0; i<n; i++) {
    a = nodes[i];
    for (j=i+1; j<n; j++) {
      b = nodes[j];
      dx = b.x - a.x;
      if (dx > a.r + maxAhead[j]) break;
      dy = b.y - a.y;
      sum = a.r + b.r;
      if (dy > sum || dy < -sum) continue;
      distSq = dx * dx + dy * dy;
      if (distSq >= sum * sum) continue;
      cb(a, b, dx, dy, distSq, sum);
    }
  }
}

function compareX(a, b) {
  // Break ties by original index, so the order of equally positioned nodes
  // doesn't depend on the engine's sort implementation.
  return a.x - b.x || a.i - b.i;
}

function separate(a, b, dx, dy, distSq, sum, strength) {
  var ux, uy, overlap, dist, dir, shift, share;
  if (distSq > 0) {
    dist = Math.sqrt(distSq);
    ux = dx / dist;
    uy = dy / dist;
    overlap = sum - dist;
  } else {
    // Coincident nodes: pick a repeatable arbitrary direction
    dir = getPseudoDirection(a.i, b.i);
    ux = dir[0];
    uy = dir[1];
    overlap = sum;
  }
  shift = overlap * strength;
  share = b.r * b.r / (a.r * a.r + b.r * b.r); // portion moved by a
  a.x -= ux * shift * share;
  a.y -= uy * shift * share;
  b.x += ux * shift * (1 - share);
  b.y += uy * shift * (1 - share);
}

// A deterministic stand-in for d3-force's jiggle(), which uses Math.random()
function getPseudoDirection(i, j) {
  var hash = (Math.imul(i + 1, 2654435761) ^ Math.imul(j + 1, 1597334677)) >>> 0,
      x = (hash & 0xffff) / 0x8000 - 1,
      y = ((hash >>> 16) & 0xffff) / 0x8000 - 1,
      dist = Math.sqrt(x * x + y * y);
  return dist > 0 ? [x / dist, y / dist] : [1, 0];
}

function anyNodeCanMove(nodes) {
  for (var i=0; i<nodes.length; i++) {
    if (nodes[i].maxShift > 0) return true;
  }
  return false;
}

// Pull each node back onto the circle of radius node.maxShift around its anchor.
function limitDisplacement(nodes) {
  var node, maxShift, dx, dy, distSq, k, i;
  for (i=0; i<nodes.length; i++) {
    node = nodes[i];
    maxShift = node.maxShift;
    dx = node.x - node.x0;
    dy = node.y - node.y0;
    distSq = dx * dx + dy * dy;
    if (distSq <= maxShift * maxShift) continue;
    k = maxShift / Math.sqrt(distSq);
    node.x = node.x0 + dx * k;
    node.y = node.y0 + dy * k;
  }
}
