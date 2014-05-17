/* @requires topojson-common */

TopoJSON.dissolveArcs = function(topology) {

  var arcs = topology.arcs,
      n = arcs.length,
      i = 1,
      stale = n + 3,
      fresh = n + 4;

  var fw = new Int32Array(n),
      bw = new Int32Array(n),
      flags = new Uint8Array(n);

  Utils.initializeArray(fw, fresh);
  Utils.initializeArray(bw, fresh);

  // pass 1: load data
  Utils.forEach(topology.objects, function(obj) {
    TopoJSON.forEachPath(obj, handlePath);
  });

  // pass2: dissolve
  Utils.forEach(topology.objects, function(obj) {
    TopoJSON.forEachPath(obj, dissolveArcs);
  });

  function absId(id) {
    return id < 0 ? ~id : id;
  }

  function dissolveVertex(id1, id2, next, prev) {
    var abs1 = absId(id1),
        abs2 = absId(id2),
        fw1 = id1 >= 0,
        fw2 = id2 >= 0,
        arr1 = fw1 ? next : prev,
        arr2 = fw2 ? prev : next,
        arc1 = arcs[abs1],
        arc2 = arcs[abs2];

    if (arr1[abs1] != stale && arr2[abs2] != stale) {
      if (arc1 && arc2) {
        // dissolve 1 into 2
        if (id1 < 0 != id2 < 0) {
          arc1.reverse();
        }
        if (id2 >= 0) {
          arc1.pop();
          arcs[abs2] = arc1.concat(arc2);
        } else {
          arc2.pop();
          arcs[abs2] = arc2.concat(arc1);
        }
        arcs[abs1] = null;
      }
      if (arcs[abs1] === null) flags[abs1] = 1;
      return true;
    }
    return false;
  }

  function dissolveArcs(arcs) {
    var id1, id2, handled,
        filtered, dissolved = false;
    for (var i=0, n=arcs.length; i<n; i++) {
      id1 = arcs[i];
      id2 = arcs[(i+1) % n];
      dissolved = dissolved || dissolveVertex(id1, id2, fw, bw);
    }
    if (dissolved) {
      filtered = Utils.filter(arcs, function(id) {
        return !flags[absId(id)];
      });
      if (filtered.length === 0) error("Empty path");
    //console.log(">> dissolved?", dissolved, 'filtered:', filtered, 'flags:', Utils.toArray(flags));
      return filtered;
    }
  }

  function handleVertex(id1, id2, next, prev) {
    var abs1 = absId(id1),
        abs2 = absId(id2),
        fw1 = id1 >= 0,
        fw2 = id2 >= 0,
        arr1 = fw1 ? next : prev,
        arr2 = fw2 ? prev : next,
        pair1 = fw1 == fw2 ? id2 : ~id2,
        pair2 = fw1 == fw2 ? ~id1 : id1;

    //console.log("id1:", id1, "id2:", id2, "fw1?", fw1, "fw2?", fw2)

    if (abs1 == abs2) { // island: can't dissolve
      next[abs1] = stale;
      prev[abs1] = stale;
    } if (arr1[abs1] == fresh && arr2[abs2] == fresh) {
      arr1[abs1] = pair1;
      arr2[abs2] = pair2;
    } else if (arr1[abs1] != pair1 || arr2[abs2] != pair2) {
      //console.log(" ... actual 1:", arr1[abs1], "expected:", pair1);
      //console.log(" ... actual 2:", arr2[abs2], "expected:", pair2);
      arr1[abs1] = stale;
      arr2[abs2] = stale;
    }
  }

  function handlePath(arcs) {
    var id1, id2, handled, p;
    for (var i=0, n=arcs.length; i<n; i++) {
      id1 = arcs[i];
      id2 = arcs[(i+1) % n];
      handleVertex(id1, id2, fw, bw);
    }
    //console.log("fw:", Utils.toArray(fw));
    //console.log("bw:", Utils.toArray(bw));
  }
};
