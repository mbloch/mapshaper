
/* @requires mapshaper-nodes, mapshaper-shape-geom, mapshaper-segment-geom */

internal.closeGaps = function(lyr, dataset, opts) {
  var arcFilter = internal.getArcPresenceTest(lyr.shapes, dataset.arcs.size());
  var nodes = new NodeCollection(dataset.arcs, arcFilter);
  var maxGapLen = opts.gap_tolerance > 0 ? opts.gap_tolerance : 0;
  var dangles = internal.findPotentialUndershoots(nodes, maxGapLen);
  var patchedArcs;
  if (dangles.length === 0) return nodes;
  patchedArcs = internal.patchGaps(dangles, nodes.arcs, arcFilter, maxGapLen);
  dataset.arcs = patchedArcs; // TODO: make sure this never causes problems
  return internal.addIntersectionCuts(dataset, {});
};

internal.patchGaps = function(dangles, arcs, arcFilter, patchLen) {
  var arcShapes = internal.arcsToShapes(arcs, arcFilter);
  var index = new PathIndex(arcShapes, arcs);
  var extensions = [];
  dangles.forEach(function(dangle) {
    var absId = absArcId(dangle.arc);
    var cands = index.findPointEnclosureCandidates(dangle.point, patchLen);
    cands = cands.filter(function(candId) {return candId != absId;});
    var nearestHit = cands.reduce(function(memo, candId) {
      var hit = geom.getPointToPathInfo(dangle.point[0], dangle.point[1], [candId], arcs);
      if (hit && hit.distance <= patchLen && (!memo || hit.distance < memo.distance)) {
        memo = hit;
      }
      return memo;
    }, null);
    if (nearestHit) {
      extensions.push(internal.getArcExtension(nearestHit, dangle.arc, arcs));
    }
  });

  // TODO: consider alternative: append small patch arcs to paths instead of shifting endpoints
  return internal.insertArcExtensions(arcs, extensions);
};

internal.insertArcExtensions = function(arcs, extensions) {
  var data = arcs.getVertexData();
  extensions.forEach(function(obj) {
    var arcId = obj.arc,
        absId = absArcId(arcId),
        fwd = arcId >= 0,
        i = arcs.indexOfVertex(arcId, -1);
    data.xx[i] = obj.point[0];
    data.yy[i] = obj.point[1];
  });

  // re-index arc bounds
  arcs.updateVertexData(data.nn, data.xx, data.yy, data.zz);
  return arcs;
};

internal.chooseCloserPoint = function(p, a, b) {
  return distance2D(p[0], p[1], a[0], a[1]) < distance2D(p[0], p[1], b[0], b[1]) ? a : b;
};

internal.pointIsEndpoint = function(p, a, b) {
  return p[0] == a[0] && p[1] == a[1] || p[0] == b[0] && p[1] == b[1];
};

internal.addTinyOvershoot = function(a, b) {
  var dist = distance2D(a[0], a[1], b[0], b[1]);
  var k = (dist + 1e-6) / dist;
  return [a[0] + k * (b[0] - a[0]), a[1] + k * (b[1] - a[1])];
};

internal.getArcExtension = function(hit, arcId, arcs) {
  var k = 1.01,
      v0 = arcs.getVertex(arcId, -1),
      endPtOld = [v0.x, v0.y],
      v1 = arcs.getVertex(arcId, -2),
      p1 = [v1.x, v1.y],
      s1 = hit.segment[0],
      s2 = hit.segment[1],
      endPtNew = geom.findClosestPointOnSeg(endPtOld[0], endPtOld[1], s1[0], s1[1], s2[0], s2[1]);
  if (!internal.pointIsEndpoint(endPtNew, s1, s2)) {
    // add small overshoot if new endpoint is not a vertex, to make sure intersection
    // is correctly detected later
    endPtNew = internal.addTinyOvershoot(p1, endPtNew);
    // handle floating point rounding errors by snapping to a segment endpoint
    if (!geom.segmentIntersection(p1[0], p1[1], endPtNew[0], endPtNew[1], s1[0], s1[1], s2[0], s2[1])) {
      endPtNew = internal.chooseCloserPoint(p1, s1, s2);
    }
    // TODO: test edge cases; moving the endpoint of a dangling arc could create
    //   invalid geometry, e.g. duplicate points
  }
  return {
    arc: arcId,
    point: endPtNew
  };
};

internal.arcsToShapes = function(arcs, filter) {
  var shapes = [];
  for (var i=0, n=arcs.size(); i<n; i++) {
    shapes.push(filter(i) ? [[i]] : null);
  }
  return shapes;
};

internal.findPotentialUndershoots = function(nodes, maxLen) {
  return nodes.findDanglingEndpoints().filter(function(o) {
    return geom.calcPathLen([o.arc], nodes.arcs) > maxLen;
  });
};
