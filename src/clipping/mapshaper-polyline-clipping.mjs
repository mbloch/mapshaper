import { PathIndex } from '../paths/mapshaper-path-index';

// Assumes: Arcs have been divided
//
export function clipPolylines(targetShapes, clipShapes, nodes, type) {
  var index = new PathIndex(clipShapes, nodes.arcs);

  return targetShapes.map(function(shp) {
    return clipPolyline(shp);
  });

  function clipPolyline(shp) {
    var clipped = null;
    if (shp) clipped = shp.reduce(clipPath, []);
    return clipped && clipped.length > 0 ? clipped : null;
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
}
