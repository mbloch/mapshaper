/* @require mapshaper-common */

MapShaper.NodeCollection = NodeCollection;

// @arcs ArcCollection
function NodeCollection(arcs) {

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
