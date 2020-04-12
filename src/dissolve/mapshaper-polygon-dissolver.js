import { fixNestingErrors } from '../polygons/mapshaper-ring-nesting';
import { reversePath } from '../paths/mapshaper-path-utils';
import { getRingIntersector } from '../paths/mapshaper-pathfinder';
import { getHoleDivider } from '../polygons/mapshaper-polygon-holes';

// TODO: remove this obsolete dissolve code (still used by clip)

function concatShapes(shapes) {
  return shapes.reduce(function(memo, shape) {
    extendShape(memo, shape);
    return memo;
  }, []);
}

function extendShape(dest, src) {
  if (src) {
    for (var i=0, n=src.length; i<n; i++) {
      dest.push(src[i]);
    }
  }
}

// TODO: to prevent invalid holes,
// could erase the holes from the space-enclosing rings.
function appendHolesToRings(cw, ccw) {
  for (var i=0, n=ccw.length; i<n; i++) {
    cw.push(ccw[i]);
  }
  return cw;
}

export function getPolygonDissolver(nodes, spherical) {
  spherical = spherical && !nodes.arcs.isPlanar();
  var flags = new Uint8Array(nodes.arcs.size());
  var divide = getHoleDivider(nodes, spherical);
  var pathfind = getRingIntersector(nodes, flags);

  return function(shp) {
    if (!shp) return null;
    var cw = [],
        ccw = [];

    divide(shp, cw, ccw);
    cw = pathfind(cw, 'flatten');
    ccw.forEach(reversePath);
    ccw = pathfind(ccw, 'flatten');
    ccw.forEach(reversePath);
    var shp2 = appendHolesToRings(cw, ccw);
    var dissolved = pathfind(shp2, 'dissolve');

    if (dissolved.length > 1) {
      dissolved = fixNestingErrors(dissolved, nodes.arcs);
    }

    return dissolved.length > 0 ? dissolved : null;
  };
}
