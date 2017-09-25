
/* @requires
mapshaper-pathfinder-utils
mapshaper-pathfinder
*/

// More information than createMosaicLayer() (for debugging mosaic topology)
internal.mosaic2 = function(layers, dataset, opts) {
  layers.forEach(internal.requirePolygonLayer);
  var nodes = internal.addIntersectionCuts(dataset, opts);
  var out = internal.buildPolygonMosaic(nodes);
  layers = layers.concat({
    geometry_type: 'polygon',
    name: 'mosaic',
    shapes: out.mosaic
  } , {
    geometry_type: 'polygon',
    name: 'enclosure',
    shapes: out.enclosures
  });
  if (out.lostArcs.length > 0) {
    layers = layers.concat(getDebugLayers(out.lostArcs, nodes.arcs));
  }
  return layers;

  function getDebugLayers(lostArcs, arcs) {
    var arcLyr = {geometry_type: 'polyline', name: 'debug', shapes: []};
    var pointLyr = {geometry_type: 'point', name: 'debug', shapes: []};
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


internal.buildPolygonMosaic = function(nodes) {
  // Assumes that insertClippingPoints() has been run
  T.start();
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
