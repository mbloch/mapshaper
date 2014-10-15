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
    var clippedPath = null,
        arcId, enclosed;
    for (var i=0; i<path.length; i++) {
      arcId = path[i];
      enclosed = index.arcIsEnclosed(arcId);
      if (enclosed && type == 'clip' || !enclosed && type == 'erase') {
        if (!clippedPath) {
          memo.push(clippedPath = []);
        }
        clippedPath.push(arcId);
      } else {
        clippedPath = null;
      }
    }
    return memo;
  }
};
