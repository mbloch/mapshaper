/* @require mapshaper-common, mapshaper-geom */

// @arcs ArcCollection
// @filter Optional filter function, arcIds that return false are excluded
//
function NodeCollection(arcs, filter) {
  if (utils.isArray(arcs)) {
    arcs = new ArcCollection(arcs);
  }
  var arcData = arcs.getVertexData(),
      nn = arcData.nn,
      xx = arcData.xx,
      yy = arcData.yy,
      chains;

  // Accessor function for arcs
  // TODO: could check that arc collection hasn't been modified, using accessor function
  Object.defineProperty(this, 'arcs', {value: arcs});

  this.toArray = function() {
    var nodes = MapShaper.findNodeTopology(arcs, filter),
        flags = new Uint8Array(nodes.xx.length),
        arr = [];
    utils.forEach(nodes.chains, function(next, i) {
      if (flags[i] == 1) return;
      arr.push([nodes.xx[i], nodes.yy[i]]);
      while (flags[next] != 1) {
        flags[next] = 1;
        next = nodes.chains[next];
      }
    });
    return arr;
  };

  this.size = function() {
    return this.toArray().length;
  };

  this.debugNode = function(arcId) {
    var ids = [arcId];
    this.forEachConnectedArc(arcId, function(id) {
      ids.push(id);
    });

    message("node ids:",  ids);
    ids.forEach(printArc);

    function printArc(id) {
      var str = id + ": ";
      var len = arcs.getArcLength(id);
      if (len > 0) {
        var p1 = arcs.getVertex(id, -1);
        str += utils.format("[%f, %f]", p1.x, p1.y);
        if (len > 1) {
          var p2 = arcs.getVertex(id, -2);
          str += utils.format(", [%f, %f]", p2.x, p2.y);
          if (len > 2) {
            var p3 = arcs.getVertex(id, 0);
            str += utils.format(", [%f, %f]", p3.x, p3.y);
          }
          str += " len: " + distance2D(p1.x, p1.y, p2.x, p2.y);
        }
      } else {
        str = "[]";
      }
      message(str);
    }
  };

  this.forEachConnectedArc = function(arcId, cb) {
    var nextId = nextConnectedArc(arcId),
        i = 0;
    while (nextId != arcId) {
      cb(nextId, i++);
      nextId = nextConnectedArc(nextId);
    }
  };

  this.getConnectedArcs = function(arcId) {
    var ids = [];
    var nextId = nextConnectedArc(arcId);
    while (nextId != arcId) {
      ids.push(nextId);
      nextId = nextConnectedArc(nextId);
    }
    return ids;
  };

  // Returns the id of the first identical arc or @arcId if none found
  // TODO: find a better function name
  this.findMatchingArc = function(arcId) {
    var nextId = nextConnectedArc(arcId),
        match = arcId;
    while (nextId != arcId) {
      if (testArcMatch(arcId, nextId)) {
        if (absArcId(nextId) < absArcId(match)) match = nextId;
      }
      nextId = nextConnectedArc(nextId);
    }
    if (match != arcId) {
      // console.log("found identical arc:", arcId, "->", match);
    }
    return match;
  };

  function getNodeChains() {
    var nodeData;
    if (!chains) {
      nodeData = MapShaper.findNodeTopology(arcs, filter);
      chains = nodeData.chains;
      if (nn.length * 2 != chains.length) error("[NodeCollection] count error");
    }
    return chains;
  }

  function testArcMatch(a, b) {
    var absA = a >= 0 ? a : ~a,
        absB = b >= 0 ? b : ~b,
        lenA = nn[absA];
    if (lenA < 2) {
      // Don't throw error on collapsed arcs -- assume they will be handled
      //   appropriately downstream.
      // error("[testArcMatch() defective arc; len:", lenA);
      return false;
    }
    if (lenA != nn[absB]) return false;
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
        chains = getNodeChains(),
        chainedId = chains[nodeId],
        nextAbsId = chainedId >> 1,
        nextArcId = chainedId & 1 == 1 ? nextAbsId : ~nextAbsId;

    if (chainedId < 0 || chainedId >= chains.length) error("out-of-range chain id");
    if (absId >= nn.length) error("out-of-range arc id");
    if (chains.length <= nodeId) error("out-of-bounds node id");
    return nextArcId;
  }

  // expose for testing
  this.internal = {
    testArcMatch: testArcMatch,
    testVertexMatch: testVertexMatch
  };
}

MapShaper.findNodeTopology = function(arcs, filter) {
  var n = arcs.size() * 2,
      xx2 = new Float64Array(n),
      yy2 = new Float64Array(n),
      ids2 = new Int32Array(n);

  arcs.forEach2(function(i, n, xx, yy, zz, arcId) {
    if (filter && !filter(arcId)) {
      return;
    }
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
