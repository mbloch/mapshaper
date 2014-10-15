/* @requires
mapshaper-path-index
*/

// Assumes: Arcs have been divided
//
MapShaper.clipPolylines = function(targetShapes, clipShapes, nodes, type) {
  var index = new PathIndex(clipShapes, nodes.arcs);

  return targetShapes.map(function(shp) {
    return clipPolyline(shp);
  });

  function clipPolyline(shp) {
    var clipped = shp.reduce(clipPath, []);
    return clipped.length > 0 ? clipped : null;
  }

  function clipPath(memo, path) {
    var path2 = [],
        arcId, enclosed;
    for (var i=0; i<path.length; i++) {
      arcId = path[i];
      enclosed = index.arcIsEnclosed(arcId);
      if (enclosed && type == 'clip' || !enclosed && type == 'erase') {
        path2.push(arcId);
      } else if (path2.length > 0) {
        memo.push(path2);
        path2 = [];
      }
    }
    if (path2.length > 0) memo.push(path2);
    return memo;
  }
};
