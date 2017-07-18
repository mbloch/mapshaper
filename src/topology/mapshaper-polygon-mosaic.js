
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
  var rings = [], ring;
  var retn = {};

  for (var i=0, n=flags.length; i<n; i++) {
    tryPath(i);
    tryPath(~i);
  }
  retn.rings = rings;
  if (deadArcs.length > 0) retn.collisions = deadArcs;
  return retn;

  function tryPath(arcId) {
    var ring;
    if (!routeIsOpen(arcId)) return;
    ring = findPath(arcId);
    if (ring) {
      rings.push(ring);
    } else {
      deadArcs.push(arcId);
      console.log("Dead-end arc:", arcId);
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
