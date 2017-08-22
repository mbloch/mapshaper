
/* @requires mapshaper-nodes, mapshaper-shape-geom */

internal.closeGaps = function(lyr, dataset, opts) {
  var arcFilter = internal.getArcPresenceTest(lyr.shapes, dataset.arcs.size());
  var nodes = new NodeCollection(dataset.arcs, arcFilter);
  var maxGapLen = opts.gap_tolerance > 0 ? opts.gap_tolerance : 0;
  var dangles = internal.findPotentialUndershoots(nodes, maxGapLen);
  var patchedArcs;
  if (dangles.length === 0) return nodes;
  patchedArcs = internal.patchGaps(dangles, lyr.shapes, nodes.arcs, maxGapLen);
  dataset.arcs = patchedArcs; // TODO: make sure you can just do this
  // nodes = new NodeCollection(patchedArcs);
  nodes = internal.addIntersectionCuts(dataset, {});
  return nodes; // TODO: return modified arcs
};

internal.patchGaps = function(dangles, shapes, arcs, patchLen) {
  var dangleTest = internal.getDirectedArcPresenceTest(utils.pluck(dangles, 'arc'), arcs.size());
  var patchArcs = [];
  var arcCount = arcs.size();
  internal.traversePaths(shapes, null, function(obj) {
    var ids = obj.arcs;
    var first = ~ids[0];
    var last = ids[ids.length - 1];
    var arc;
    if (dangleTest(first)) {
      arc = internal.getPatchArc(first, arcs, patchLen);
      ids = ids.concat();
      ids.unshift(~(arcCount + patchArcs.length));
      patchArcs.push(arc);
    }
    if (dangleTest(last)) {
      arc = internal.getPatchArc(last, arcs, patchLen);
      ids = ids.concat(arcCount + patchArcs.length);
      patchArcs.push(arc);
    }
    if (ids != obj.arcs) {
      shapes[obj.shapeId][obj.i] = ids; // replace original path with augmented path
    }
  });
  return internal.mergeArcs([arcs, new ArcCollection(patchArcs)]);
};

internal.findPotentialUndershoots = function(nodes, maxLen) {
  return nodes.findDanglingEndpoints().filter(function(o) {
    return geom.calcPathLen([o.arc], nodes.arcs) > maxLen;
  });
};

// Return coordinates of a one-segment arc leading outwards
// from the first vertex of @arcId with length @segLen.
internal.getPatchArc = function(arcId, arcs, segLen) {
  var a = arcs.getVertex(arcId, -1),
      b = arcs.getVertex(arcId, -2),
      len = geom.distance2D(a.x, a.y, b.x, b.y),
      k = segLen / len,
      c = [a.x + (a.x - b.x) * k, a.y + (a.y - b.y) * k];
  return [[a.x, a.y], c];
};
