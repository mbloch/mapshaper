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
// the caller's job. A node is {i, x, y, x0, y0, r}, where x0,y0 is the anchor
// (the symbol's true position) and r includes any padding.

export var symbolCollisionDefaults = {
  ticks: 100,
  max_shift: 12,
  strength: 0.7
};

// Mutates the x,y properties of @nodes. Returns the number of nodes that moved.
export function resolveSymbolCollisions(nodes, opts) {
  var ticks = opts.ticks,
      maxShift = opts.max_shift,
      strength = opts.strength,
      moved = 0,
      i;
  if (nodes.length < 2 || !(maxShift > 0) || !(ticks > 0)) return 0;
  for (i=0; i<ticks; i++) {
    resolveCollisions(nodes, strength);
    // Limiting the displacement on every pass (instead of only at the end)
    // avoids pulling symbols back into the overlaps they just escaped.
    limitDisplacement(nodes, maxShift);
  }
  for (i=0; i<nodes.length; i++) {
    if (nodes[i].x !== nodes[i].x0 || nodes[i].y !== nodes[i].y0) moved++;
  }
  return moved;
}

// Number of overlapping pairs, for reporting how much of the job got done.
// Pairs that overlap by less than a hundredth of a pixel are separated as far
// as they are going to get: a solved layout typically leaves many symbols
// touching, and counting those as unresolved would understate the result.
export function countSymbolCollisions(nodes) {
  var count = 0;
  forEachCollision(nodes, function(a, b, dx, dy, distSq, sum) {
    if (sum - Math.sqrt(distSq) > 0.01) count++;
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

// Pull each node back onto the circle of radius @maxShift around its anchor.
function limitDisplacement(nodes, maxShift) {
  var node, dx, dy, distSq, k, i;
  for (i=0; i<nodes.length; i++) {
    node = nodes[i];
    dx = node.x - node.x0;
    dy = node.y - node.y0;
    distSq = dx * dx + dy * dy;
    if (distSq <= maxShift * maxShift) continue;
    k = maxShift / Math.sqrt(distSq);
    node.x = node.x0 + dx * k;
    node.y = node.y0 + dy * k;
  }
}
