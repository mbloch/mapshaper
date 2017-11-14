
/* @requires
mapshaper-pathfinder-utils
mapshaper-pathfinder
*/

// Create mosaic layer from arcs (for debugging mosaic function)
internal.mosaic = function(dataset, opts) {
  var layers2 = [];
  var nodes, output;
  if (!dataset.arcs) stop("Dataset is missing path data");
  nodes = internal.addIntersectionCuts(dataset, opts);
  output = internal.buildPolygonMosaic(nodes);
  layers2.push({
    name: 'mosaic',
    shapes: output.mosaic,
    geometry_type: 'polygon'
  });
  if (opts.debug) {
    layers2.push({
      geometry_type: 'polygon',
      name: 'mosaic-enclosure',
      shapes: output.enclosures
    });

    if (output.lostArcs.length > 0) {
      layers2 = layers2.concat(getLostArcLayers(output.lostArcs, nodes.arcs));
    }
  }
  return layers2;

  function getLostArcLayers(lostArcs, arcs) {
    var arcLyr = {geometry_type: 'polyline', name: 'lost-arcs', shapes: []};
    var pointLyr = {geometry_type: 'point', name: 'lost-arc-endpoints', shapes: []};
    var arcData = [];
    var pointData = [];
    lostArcs.forEach(function(arcId) {
      var first = arcs.getVertex(arcId, 0);
      var last = arcs.getVertex(arcId, -1);
      arcData.push({ARCID: arcId});
      arcLyr.shapes.push([[arcId]]);
      pointData.push({ARCID: arcId}, {ARCID: arcId});
      pointLyr.shapes.push([[first.x, first.y]], [[last.x, last.y]]);
    });
    arcLyr.data = new DataTable(arcData);
    pointLyr.data = new DataTable(pointData);
    return [arcLyr, pointLyr];
  }
};

internal.findMosaicRings = function(nodes) {
  var arcs = nodes.arcs,
      cw = [],
      ccw = [],
      empty = [],
      lostArcs = [];

  var flags = new Uint8Array(arcs.size());
  var findPath = internal.getPathFinder(nodes, useRoute);

  for (var i=0, n=flags.length; i<n; i++) {
    tryPath(i);
    // TODO: consider skipping detection of island ccw paths here (if possible)
    tryPath(~i);
  }
  return {
    cw: cw,
    ccw: ccw,
    empty: empty,
    lostArcs: lostArcs
  };

  function tryPath(arcId) {
    var ring, area;
    if (!routeIsOpen(arcId)) return;
    ring = findPath(arcId);
    if (!ring) {
      // arc is unused, but can not be extended to a complete ring
      lostArcs.push(arcId);
      debug("Dead-end arc:", arcId);
      return;
    }
    area = geom.getPlanarPathArea(ring, arcs);
    if (area > 0) {
      cw.push(ring);
    } else if (area < 0) {
      ccw.push(ring);
    } else {
      empty.push(ring);
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


// Assumes that the arc-node topology of @nodes NodeCollection meets these
//    conditions (should be true if addIntersectionCuts() has been run)
// 1. Arcs only touch at endpoints.
// 2. The angle between any two segments that meet at a node is never zero.
//      (this should follow from 1... but may occur due to FP errors)
// TODO: a better job of handling FP errors
//
internal.buildPolygonMosaic = function(nodes) {
  T.start();
  // Detach any spikes from arc graph (modifies nodes -- a side effect)
  nodes.detachAcyclicArcs();
  var data = internal.findMosaicRings(nodes);
  var mosaic = data.cw.map(function(ring) {return [ring];});
  T.stop('Find mosaic rings');
  T.start();
  var index = new PathIndex(mosaic, nodes.arcs);
  var enclosures = [];

  // add holes to mosaic polygons
  // TODO: optimize -- checking ccw path of every island is costly
  data.ccw.forEach(function(ring) {
    var id = index.findSmallestEnclosingPolygon(ring);
    if (id > -1) {
      mosaic[id].push(ring);
    } else {
      internal.reversePath(ring);
      enclosures.push([ring]);
    }
  });
  T.stop(utils.format("Detect holes (holes: %d, enclosures: %d)", data.ccw.length - enclosures.length, enclosures.length));

  return {mosaic: mosaic, enclosures: enclosures, lostArcs: data.lostArcs};
};
