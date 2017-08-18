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
      nodeData;

  // Accessor function for arcs
  Object.defineProperty(this, 'arcs', {value: arcs});

  var toArray = this.toArray = function() {
    var chains = getNodeChains(),
        flags = new Uint8Array(chains.length),
        arr = [];
    utils.forEach(chains, function(nextIdx, thisIdx) {
      var node;
      if (flags[thisIdx] == 1) return;
      node = {coordinates: [nodeData.xx[thisIdx], nodeData.yy[thisIdx]], arcs: []};
      arr.push(node);
      while (flags[thisIdx] != 1) {
        node.arcs.push(chainToArcId(thisIdx));
        flags[thisIdx] = 1;
        thisIdx = chains[thisIdx];
      }
    });
    return arr;
  };

  this.size = function() {
    return this.toArray().length;
  };

  this.detachArc = function(arcId) {
    unlinkDirectedArc(arcId);
    unlinkDirectedArc(~arcId);
  };

  this.detachAcyclicArcs = function() {
    var chains = getNodeChains(),
        count = 0,
        fwd, rev;
    for (var i=0, n=chains.length; i<n; i+= 2) {
      fwd = i == chains[i];
      rev = i + 1 == chains[i + 1];
      // detach arcs that are connected at one end but not both
      if (fwd && !rev || !fwd && rev) {
        this.detachArc(chainToArcId(i));
        count++;
      }
    }
    if (count > 0) {
      // removing one acyclic arc could expose another -- need another pass
      count += this.detachAcyclicArcs();
    }
    return count;
  };

  function unlinkDirectedArc(arcId) {
    var chainId = arcToChainId(arcId),
        chains = getNodeChains(),
        nextId = chains[chainId],
        prevId = prevChainId(chainId);
    chains[chainId] = chainId;
    chains[prevId] = nextId;
  }

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

  function chainToArcId(chainId) {
    var absId = chainId >> 1;
    return chainId & 1 == 1 ? absId : ~absId;
  }

  function arcToChainId(arcId) {
    var fw = arcId >= 0;
    return fw ? arcId * 2 + 1 : (~arcId) * 2; // if fw, use end, if rev, use start
  }

  function getNodeChains() {
    if (!nodeData) {
      nodeData = internal.findNodeTopology(arcs, filter);
      if (nn.length * 2 != nodeData.chains.length) error("[NodeCollection] count error");
    }
    return nodeData.chains;
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
    var chainId = arcToChainId(arcId),
        chains =  getNodeChains(),
        nextChainId = chains[chainId];
    if (!(nextChainId >= 0 && nextChainId < chains.length)) error("out-of-range chain id");
    return chainToArcId(nextChainId);
  }

  function prevChainId(chainId) {
    var chains = getNodeChains(),
        prevId = chainId,
        nextId = chains[chainId];
    while (nextId != chainId) {
      prevId = nextId;
      nextId = chains[nextId];
      if (nextId == prevId) error("Node indexing error");
    }
    return prevId;
  }

  // expose functions for testing
  this.internal = {
    testArcMatch: testArcMatch,
    testVertexMatch: testVertexMatch
  };
}

internal.findNodeTopology = function(arcs, filter) {
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
