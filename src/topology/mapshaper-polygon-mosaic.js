
/* @requires
mapshaper-pathfinder-utils
mapshaper-pathfinder
*/


// create mosaic layer from arcs (for debugging mosaic function)
internal.createMosaicLayer = function(dataset, opts) {
  var nodes = internal.addIntersectionCuts(dataset, opts);
  nodes.detachAcyclicArcs();
  return {
    name: 'mosaic',
    shapes: internal.buildPolygonMosaic(nodes).mosaic,
    geometry_type: 'polygon'
  };
};

internal.findMosaicRings = function(nodes) {
  var arcs = nodes.arcs,
      cw = [],
      ccw = [],
      lostArcs = [];

  var flags = new Uint8Array(arcs.size());
  var findPath = internal.getPathFinder(nodes, useRoute);

  for (var i=0, n=flags.length; i<n; i++) {
    tryPath(i);
    tryPath(~i);
  }

  return {
    cw: cw,
    ccw: ccw,
    lostArcs: lostArcs
  };

  function tryPath(arcId) {
    var ring;
    if (!routeIsOpen(arcId)) return;
    ring = findPath(arcId);
    if (!ring) {
      // arc is unused, but can not be extended to a complete ring
      lostArcs.push(arcId);
      debug("Dead-end arc:", arcId);
    } else if (geom.getPlanarPathArea(ring, arcs) > 0) {
      cw.push(ring);
    } else {
      ccw.push(ring);
    }
  }

  function useRoute(arcId) {
    return routeIsOpen(arcId, true);
  }

  function routeIsOpen(arcId, closeRoute) {
    var absId = absArcId(arcId);
    var bit = absId == arcId ? 1 : 2;
    var isOpen = (flags[absId] & bit) === 0;
    if (closeRoute && isOpen) flags[absId] |= bit;
    return isOpen;
  }
};


internal.buildPolygonMosaic = function(nodes) {
  // Assumes that insertClippingPoints() has been run
  var data = internal.findMosaicRings(nodes);
  var mosaic = data.cw.map(function(ring) {return [ring];});
  var index = new PathIndex(mosaic, nodes.arcs);
  var enclosures = [];

  // add holes to mosaic polygons
  // TODO: skip this step if layer contains no holes (how to tell?)
  data.ccw.forEach(function(ring) {
    var id = index.findSmallestEnclosingPolygon(ring);
    if (id > -1) {
      mosaic[id].push(ring);
    } else {
      internal.reversePath(ring);
      enclosures.push([ring]);
    }
  });

  return {mosaic: mosaic, enclosures: enclosures, lostArcs: data.lostArcs};
};
