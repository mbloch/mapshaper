
/* @requires
mapshaper-pathfinder-utils
mapshaper-pathfinder
*/

internal.buildPolygonMosaic = function(nodes) {
  // Assumes that insertClippingPoints() has been run
  var arcs = nodes.arcs;
  var flags = new Uint8Array(arcs.size());
  var findPath = internal.getPathFinder(nodes, useRoute);
  var deadArcs = [];
  var reverseRings = [];
  var enclosures = [];
  var mosaic = [], ring, index;
  var retn = {mosaic: mosaic, enclosures: enclosures};

  for (var i=0, n=flags.length; i<n; i++) {
    tryPath(i);
    tryPath(~i);
  }

  // add holes to mosaic polygons
  // TODO: skip this step if layer contains no holes (how to tell?)
  index = new PathIndex(mosaic, arcs);
  reverseRings.forEach(function(ring) {
    var id = index.findSmallestEnclosingPolygon(ring);
    if (id > -1) {
      mosaic[id].push(ring);
    } else {
      internal.reversePath(ring);
      enclosures.push([ring]);
    }
  });

  if (deadArcs.length > 0) retn.collisions = deadArcs;
  return retn;

  function tryPath(arcId) {
    var ring;
    if (!routeIsOpen(arcId)) return;
    ring = findPath(arcId);
    if (ring) {
      if (geom.getPlanarPathArea(ring, arcs) > 0) {
        mosaic.push([ring]);
      } else {
        reverseRings.push(ring);
      }
    } else {
      deadArcs.push(arcId);
      debug("Dead-end arc:", arcId);
    }
  }

  function routeIsOpen(arcId, closeRoute) {
    var absId = absArcId(arcId);
    var bit = absId == arcId ? 1 : 2;
    var isOpen = (flags[absId] & bit) === 0;
    if (closeRoute && isOpen) flags[absId] |= bit;
    return isOpen;
  }

  function useRoute(arcId) {
    return routeIsOpen(arcId, true);
  }
};
