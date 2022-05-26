
import { initPointChains } from '../topology/mapshaper-topology-chains-v2';
import { error } from '../utils/mapshaper-logging';
import { ArcCollection } from '../paths/mapshaper-arcs';
import utils from '../utils/mapshaper-utils';
import { absArcId } from '../paths/mapshaper-arc-utils';

// @arcs ArcCollection
// @filter Optional filter function, arcIds that return false are excluded
//
export function NodeCollection(arcs, filter) {
  if (Array.isArray(arcs)) {
    arcs = new ArcCollection(arcs);
  }
  var arcData = arcs.getVertexData(),
      nn = arcData.nn,
      xx = arcData.xx,
      yy = arcData.yy,
      nodeData;

  // Accessor function for arcs
  Object.defineProperty(this, 'arcs', {value: arcs});

  this.toArray = function() {
    var chains = getNodeChains(),
        flags = new Uint8Array(chains.length),
        arr = [];
    utils.forEach(chains, function(nextIdx, thisIdx) {
      var node, p;
      if (flags[thisIdx] == 1) return;
      p = getEndpoint(thisIdx);
      if (!p) return; // endpoints of an excluded arc
      node = {coordinates: p, arcs: []};
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

  this.findDanglingEndpoints = function() {
    var chains = getNodeChains(),
        arr = [], p;
    for (var i=0, n=chains.length; i<n; i++) {
      if (chains[i] != i) continue; // endpoint attaches to a node
      p = getEndpoint(i);
      if (!p) continue; // endpoint belongs to an excluded arc
      arr.push({
        point: p,
        arc: chainToArcId(i)
      });
    }
    return arr;
  };

  this.detachAcyclicArcs = function() {
    var chains = getNodeChains(),
        count = 0,
        fwd, rev;
    for (var i=0, n=chains.length; i<n; i+= 2) {
      fwd = i == chains[i];
      rev = i + 1 == chains[i + 1];
      // detach arcs that are disconnected at one end or the other
      if ((fwd || rev) && !linkIsDetached(i)) {
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

  this.detachArc = function(arcId) {
    unlinkDirectedArc(arcId);
    unlinkDirectedArc(~arcId);
  };

  this.forEachConnectedArc = function(arcId, cb) {
    var nextId = nextConnectedArc(arcId),
        i = 0;
    while (nextId != arcId) {
      cb(nextId, i++);
      nextId = nextConnectedArc(nextId);
    }
  };

  // Receives an arc id for an arc that enters a node.
  // Returns an array of ids of all other arcs that are connected to the same node.
  //    Returned ids lead into the node (as opposed to outwards from it)
  // An optional filter function receives the directed id (positive or negative)
  //    of each connected arc and excludes arcs for which the filter returns false.
  //    The filter is also applied to the initial arc; if false, no arcs are returned.
  //
  this.getConnectedArcs = function(arcId, filter) {
    var ids = [];
    var filtered = !!filter;
    var nextId = nextConnectedArc(arcId);
    if (filtered && !filter(arcId)) {
      // return ids;
    }
    while (nextId != arcId) {
      if (!filtered || filter(nextId)) {
        ids.push(nextId);
      }
      nextId = nextConnectedArc(nextId);
    }
    return ids;
  };

  // Returns the id of the first identical arc or @arcId if none found
  // TODO: find a better function name
  this.findDuplicateArc = function(arcId) {
    var nextId = nextConnectedArc(arcId),
        match = arcId;
    while (nextId != arcId) {
      if (testArcMatch(arcId, nextId)) {
        if (absArcId(nextId) < absArcId(match)) match = nextId;
      }
      nextId = nextConnectedArc(nextId);
    }
    return match;
  };

  // returns null if link has been removed from node collection
  function getEndpoint(chainId) {
    return linkIsDetached(chainId) ? null : [nodeData.xx[chainId], nodeData.yy[chainId]];
  }

  function linkIsDetached(chainId) {
    return isNaN(nodeData.xx[chainId]);
  }

  function unlinkDirectedArc(arcId) {
    var chainId = arcToChainId(arcId),
        chains = getNodeChains(),
        nextId = chains[chainId],
        prevId = prevChainId(chainId);
    nodeData.xx[chainId] = NaN;
    nodeData.yy[chainId] = NaN;
    chains[chainId] = chainId;
    chains[prevId] = nextId;
  }

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
      nodeData = findNodeTopology(arcs, filter);
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
    if (!(nextChainId >= 0 && nextChainId < chains.length)) {
      // console.log('arcId:', arcId, 'chainId:', chainId, 'next chain id:', nextChainId)
      error("out-of-range chain id");
    }
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

function findNodeTopology(arcs, filter) {
  var n = arcs.size() * 2,
      xx2 = new Float64Array(n),
      yy2 = new Float64Array(n),
      ids2 = new Int32Array(n);

  arcs.forEach2(function(i, n, xx, yy, zz, arcId) {
    var start = i,
        end = i + n - 1,
        start2 = arcId * 2,
        end2 = start2 + 1,
        ax = xx[start],
        ay = yy[start],
        bx = xx[end],
        by = yy[end];
    if (filter && !filter(arcId)) {
      ax = ay = bx = by = NaN;
    }

    xx2[start2] = ax;
    yy2[start2] = ay;
    ids2[start2] = arcId;
    xx2[end2] = bx;
    yy2[end2] = by;
    ids2[end2] = arcId;
  });

  var chains = initPointChains(xx2, yy2);
  return {
    xx: xx2,
    yy: yy2,
    ids: ids2,
    chains: chains
  };
}
