/*
// work in progress
MapShaper.filterExternal = function(lyr, arcs, ringTest) {
  var removed = 0;
  var counts = new Uint8Array(arcs.size());
  MapShaper.countArcsInShapes(lyr.shapes, counts);

  var filter = function(paths) {
    return MapShaper.editPaths(paths, function(path) {
      var n = path.length,
          external = false;
      // TODO: put in a function
      for (var i=0; i<n; i++) {
        if (counts[absArcId(path[i])] === 1) { // has an edge arc (not shared with another shape)
          external = true;
          break;
        }
      }
      if (external && (!ringTest || ringTest(path))) { // and it meets any filtering criteria
        // and it does not contain any holes itself
        // O(n^2), so testing this last
        if (!MapShaper.ringHasHoles(path, paths, arcs)) {
          removed++;
          return null;
        }
      }
    });
  };
  MapShaper.filterShapes(lyr.shapes, filter);
  return removed;
};
*/