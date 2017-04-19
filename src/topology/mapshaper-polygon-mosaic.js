
/* @requires
mapshaper-pathfinder-utils
mapshaper-pathfinder
*/

internal.buildPolygonMosaic = function(nodes) {
  // Assumes that insertClippingPoints() has been run
  var arcs = nodes.arcs;
  var flags = new Uint8Array(arcs.size());
  var findPath = internal.getPathFinder(nodes, useRoute);
  var rings = [], ring;
  for (var i=0, n=flags.length; i<n; i++) {
    ring = findPath(i);
    if (ring) rings.push(ring);
    ring = findPath(~i);
    if (ring) rings.push(ring);
  }
  return rings;

  function useRoute(arcId) {
    var absId = absArcId(arcId);
    var bit = absId == arcId ? 1 : 2;
    if ((flags[absId] & bit) === 0) {
      flags[absId] |= bit;
      return true;
    }
    return false;
  }
};
