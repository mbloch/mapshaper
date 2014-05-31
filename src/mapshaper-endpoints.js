/* @require mapshaper-common, mapshaper-geom */

MapShaper.NodeCollection = NodeCollection;

// @arcs ArcCollection
function NodeCollection(arcs) {
  var arcData = arcs.getVertexData(),
      nn = arcData.nn,
      ii = arcData.ii,
      xx = arcData.xx,
      yy = arcData.yy;

  var nodeData = MapShaper.findNodeTopology(arcs);

  this.toArray = function() {
    var flags = new Uint8Array(nodeData.xx.length),
        nodes = [];

    Utils.forEach(nodeData.chains, function(next, i) {
      if (flags[i] == 1) return;
      nodes.push([nodeData.xx[i], nodeData.yy[i]]);
      while (flags[next] != 1) {
        flags[next] = 1;
        next = nodeData.chains[next];
      }
    });
    return nodes;
  };

  this.getNextArc = function(arcId, isCW) {
    var ai = indexOfVertex(arcId, -2),
        ax = xx[ai],
        ay = yy[ai],
        bi = indexOfVertex(arcId, -1),
        bx = xx[bi],
        by = yy[bi],
        ci, cx, cy,
        di, dx, dy,
        nextId = nextConnectedArc(arcId),
        candId = arcId,
        candAngle,
        angle;

    while (nextId != arcId) {
      // get best candidate
      ci = indexOfVertex(nextId, -2);
      cx = xx[ci];
      cy = yy[ci];

      // sanity check: make sure vertex is same (else error);
      di = indexOfVertex(nextId, -1);
      dx = xx[di];
      dy = yy[di];
      if (dx !== bx || dy !== by) {
        console.log("cd:", cx, cy, dx, dy, 'arc:', nextId);
        error("Node error:");
      }

      angle = signedAngle(ax, ay, bx, by, cx, cy);
      if (angle > 0 && (candId === arcId || isCW && angle < candAngle ||
          !isCW && angle > candAngle)) {
        candId = ~nextId; // reverse arc to point onwards
        candAngle = angle;
      }
      nextId = nextConnectedArc(nextId);
    }

    return candId;
  };

  // return arcId of next arc in the chain, pointed towards the shared vertex
  function nextConnectedArc(arcId) {
    var absId = arcId < 0 ? ~arcId : arcId,
        nodeId = absId === arcId ? absId * 2 + 1: absId * 2, // if fw, use end, if rev, use start
        chainedId = nodeData.chains[nodeId],
        nextAbsId = chainedId >> 1,
        nextArcId = chainedId & 1 == 1 ? nextAbsId : ~nextAbsId;

    //console.log(".. nextConnected(); id:", arcId, "nodeId:", nodeId, "chainedId:", chainedId, "nextAbsId:", nextAbsId, "nextId:", nextArcId);
    return nextArcId;
  }

  function indexOfVertex(arcId, nth) {
    var absId = arcId < 0 ? ~arcId : arcId,
        len = nn[absId];
    if (nth < 0) nth = len + nth;
    if (absId != arcId) nth = len - nth - 1;
    return ii[absId] + nth;
  }
}


MapShaper.findNodeTopology = function(arcs) {
  var n = arcs.size() * 2,
      xx2 = new Float64Array(n),
      yy2 = new Float64Array(n),
      ids2 = new Int32Array(n);

  arcs.forEach2(function(i, n, xx, yy, zz, arcId) {
    var start = i,
        end = i + n - 1,
        start2 = arcId * 2,
        end2 = start2 + 1;
    xx2[start2] = xx[start];
    yy2[start2] = yy[start];
    ids2[start2] = arcId;
    xx2[end2] = xx[end];
    yy2[end2] = yy[end];
    ids2[end2] = arcId;
  });

  var chains = initPointChains(xx2, yy2);
  return {
    xx: xx2,
    yy: yy2,
    ids: ids2,
    chains: chains
  };
};
