/* @require mapshaper-common, mapshaper-geom */

MapShaper.NodeCollection = NodeCollection;

// @arcs ArcCollection
function NodeCollection(arcs) {
  var arcData = arcs.getVertexData(),
      nn = arcData.nn,
      xx = arcData.xx,
      yy = arcData.yy;

  var nodeData = MapShaper.findNodeTopology(arcs);

  if (nn.length * 2 != nodeData.chains.length) error("[NodeCollection] count error");

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

  this.debugNode = function(arcId) {
    var arcs = [];
    this.forEachConnectedArc(arcId, function(id) {
      arcs.push(id);
    });
    console.log("node:", arcs);
  };

  this.forEachConnectedArc = function(arcId, cb) {
    var nextId = nextConnectedArc(arcId);
    do {
      cb(nextId);
      nextId = nextConnectedArc(nextId);
    } while (nextId != arcId);
  };

  // Returns next arc in a path, or ~@prevId if path terminates
  // @test (optional) filter function
  this.getNextArc = function(prevId, isCW, test) {
    var ai = arcs.indexOfVertex(prevId, -2),
        ax = xx[ai],
        ay = yy[ai],
        bi = arcs.indexOfVertex(prevId, -1),
        bx = xx[bi],
        by = yy[bi],
        ci, cx, cy,
        di, dx, dy,
        nextId = prevId,
        nextAngle = 0,
        candId = nextConnectedArc(prevId),
        candAngle;

    while (candId != prevId) {
      // if (candId < 0) console.log("reversed arc:", candId)
      // get best candidate
      ci = arcs.indexOfVertex(candId, -2);
      cx = xx[ci];
      cy = yy[ci];

      // sanity check: make sure vertex is same (else error);
      di = arcs.indexOfVertex(candId, -1);
      dx = xx[di];
      dy = yy[di];
      if (dx !== bx || dy !== by) {
        console.log("cd:", cx, cy, dx, dy, 'arc:', candId);
        error("Node error:");
      }

      candAngle = signedAngle(ax, ay, bx, by, cx, cy);
      // if (candAngle <= 0 || candAngle >= 2 * Math.PI) console.log(candAngle);
      if (!test || test(~candId)) {
        if (candAngle > 0 && (nextAngle === 0 || isCW && candAngle < nextAngle ||
            !isCW && candAngle > nextAngle)) {
        // if (candAngle > 0 && (nextAngle === 0 || candAngle < nextAngle)) {
          nextId = candId;
          nextAngle = candAngle;
        }
        else if (candAngle == nextAngle) {
          /*
            console.log("duplicate angle:", candAngle);
            console.log("id1:", nextId, "id2:", candId);
            console.log("len1:", nn[absArcId(nextId)], "len2:", nn[absArcId(candId)]);
            console.log("arc1:", arcs.getArc(nextId).toString());
            console.log("arc2:", arcs.getArc(candId).toString());
            this.debugNode(candId);
          */
        }
      } else {
        // console.log("failed test:", candId)
      }

      candId = nextConnectedArc(candId);
    }

    return ~nextId; // reverse arc to point onwards
  };

  // Returns the id of the first identical arc or @arcId if none found
  this.findMatchingArc = function(arcId) {
    var nextId = nextConnectedArc(arcId),
        match = arcId;
    while (nextId != arcId) {
      nextId = nextConnectedArc(nextId);
      if (testArcMatch(arcId, nextId)) {
        if (absArcId(nextId) < absArcId(match)) match = nextId;
      }
      // console.log(" arcs:", arcs.toArray())
      // break;
    }

    return match;
  };

  function testArcMatch(a, b) {
    var absA = a >= 0 ? a : ~a,
        absB = b >= 0 ? b : ~b,
        lenA = nn[absA];
    if (lenA != nn[absB]) return false;
    if (lenA < 2) error("[testArcMatch() defective arc");
    if (testVertexMatch(a, b, -1) &&
        testVertexMatch(a, b, 1) &&
        testVertexMatch(a, b, -2)) {
      return true;
    }
    return false;
  }

  function testVertexMatch(a, b, i) {
    var ai = arcs.indexOfVertex(a, i),
        bi = arcs.indexOfVertex(b, i);
    return xx[ai] == xx[bi] && yy[ai] == yy[bi];
  }

  // return arcId of next arc in the chain, pointed towards the shared vertex
  function nextConnectedArc(arcId) {
    var fw = arcId >= 0,
        absId = fw ? arcId : ~arcId,
        nodeId = fw ? absId * 2 + 1: absId * 2, // if fw, use end, if rev, use start
        chainedId = nodeData.chains[nodeId],
        nextAbsId = chainedId >> 1,
        nextArcId = chainedId & 1 == 1 ? nextAbsId : ~nextAbsId;

    if (chainedId < 0 || chainedId >= nodeData.chains.length) error("out-of-range chain id");
    if (absId >= nn.length) error("out-of-range arc id");
    if (nodeData.chains.length <= nodeId) error("out-of-bounds node id");
    return nextArcId;
  }

  // expose for testing
  this.internal = {
    testArcMatch: testArcMatch,
    testVertexMatch: testVertexMatch
  };
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
  //console.log(">> chains:", Utils.toArray(chains), "arcs:", arcs.size());
  return {
    xx: xx2,
    yy: yy2,
    ids: ids2,
    chains: chains
  };
};
