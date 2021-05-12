import { DataTable } from '../datatable/mapshaper-data-table';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { getPathFinder } from '../paths/mapshaper-pathfinder';
import { reversePath } from '../paths/mapshaper-path-utils';
import { PathIndex } from '../paths/mapshaper-path-index';
import { debug, stop } from '../utils/mapshaper-logging';
import { T } from '../utils/mapshaper-timing';
import { absArcId } from '../paths/mapshaper-arc-utils';
import geom from '../geom/mapshaper-geom';
import utils from '../utils/mapshaper-utils';


// Create a mosaic layer from a dataset (useful for debugging commands like -clean
//    that create a mosaic as an intermediate data structure)
// Create additional layers if the "debug" flag is present
//
export function mosaic(dataset, opts) {
  var layers2 = [];
  var nodes, output;
  if (!dataset.arcs) stop("Dataset is missing path data");
  nodes = addIntersectionCuts(dataset, opts);
  output = buildPolygonMosaic(nodes);
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
}

// Process arc-node topology to generate a layer of indivisible mosaic "tiles" {mosaic}
//   ... also return a layer of outer-boundary polygons {enclosures}
//   ... also return an array of arcs that were dropped from the mosaic {lostArcs}
//
// Assumes that the arc-node topology of @nodes NodeCollection meets several
//    conditions (expected to be true if addIntersectionCuts() has just been run)
// 1. Arcs only touch at endpoints.
// 2. The angle between any two segments that meet at a node is never zero.
//      (this should follow from 1... but may occur due to FP errors)
// TODO: a better job of handling FP errors
//
export function buildPolygonMosaic(nodes) {
  T.start();
  // Detach any acyclic paths (spikes) from arc graph (these would interfere with
  //    the ring finding operation). This modifies @nodes -- a side effect.
  nodes.detachAcyclicArcs();
  var data = findMosaicRings(nodes);

  // Process CW rings: these are indivisible space-enclosing boundaries of mosaic tiles
  var mosaic = data.cw.map(function(ring) {return [ring];});
  debug('Find mosaic rings', T.stop());
  T.start();

  // Process CCW rings: these are either holes or enclosure
  // TODO: optimize -- testing CCW path of every island is costly
  var enclosures = [];
  var index = new PathIndex(mosaic, nodes.arcs); // index CW rings to help identify holes
  data.ccw.forEach(function(ring) {
    var id = index.findSmallestEnclosingPolygon(ring);
    if (id > -1) {
      // Enclosed CCW rings are holes in the enclosing mosaic tile
      mosaic[id].push(ring);
    } else {
      // Non-enclosed CCW rings are outer boundaries -- add to enclosures layer
      reversePath(ring);
      enclosures.push([ring]);
    }
  });
  debug(utils.format("Detect holes (holes: %d, enclosures: %d)", data.ccw.length - enclosures.length, enclosures.length), T.stop());

  return {mosaic: mosaic, enclosures: enclosures, lostArcs: data.lostArcs};
}

function findMosaicRings(nodes) {
  var arcs = nodes.arcs,
      cw = [],
      ccw = [],
      empty = [],
      lostArcs = [];

  var flags = new Uint8Array(arcs.size());
  var findPath = getPathFinder(nodes, useRoute);

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
}
