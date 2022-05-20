import { editShapes } from '../paths/mapshaper-shape-utils';
import { countArcsInShapes } from '../paths/mapshaper-path-utils';
import { getSliverFilter } from '../polygons/mapshaper-slivers';
import geom from '../geom/mapshaper-geom';
import { message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { absArcId } from '../paths/mapshaper-arc-utils';

cmd.filterIslands = function(lyr, dataset, optsArg) {
  var opts = utils.extend({sliver_control: 0}, optsArg); // no sliver control
  var arcs = dataset.arcs;
  var removed = 0;
  var filter;
  if (lyr.geometry_type != 'polygon') {
    return;
  }
  if (!opts.min_area && !opts.min_vertices) {
    message("Missing a criterion for filtering islands; use min-area or min-vertices");
    return;
  }

  if (opts.min_area) {
    filter = getSliverFilter(lyr, dataset, opts).filter;
  } else {
    filter = getVertexCountTest(opts.min_vertices, arcs);
  }
  removed += filterIslands(lyr, arcs, filter);
  if (opts.remove_empty) {
    cmd.filterFeatures(lyr, arcs, {remove_empty: true, verbose: false});
  }
  message(utils.format("Removed %'d island%s", removed, utils.pluralSuffix(removed)));
};

export function getVertexCountTest(minVertices, arcs) {
  return function(path) {
    // first and last vertex in ring count as one
    return geom.countVerticesInPath(path, arcs) <= minVertices;
  };
}

function filterIslands(lyr, arcs, ringTest) {
  var removed = 0;
  var counts = new Uint8Array(arcs.size());
  countArcsInShapes(lyr.shapes, counts);

  var pathFilter = function(path, i, paths) {
    if (path.length == 1) { // got an island ring
      if (counts[absArcId(path[0])] === 1) { // and not part of a donut hole
        if (!ringTest || ringTest(path)) { // and it meets any filtering criteria
          // and it does not contain any holes itself
          // O(n^2), so testing this last
          if (!ringHasHoles(path, paths, arcs)) {
            removed++;
            return null;
          }
        }
      }
    }
  };
  editShapes(lyr.shapes, pathFilter);
  return removed;
}

function ringIntersectsBBox(ring, bbox, arcs) {
  for (var i=0, n=ring.length; i<n; i++) {
    if (arcs.arcIntersectsBBox(absArcId(ring[i]), bbox)) {
      return true;
    }
  }
  return false;
}

// Assumes that ring boundaries to not cross
export function ringHasHoles(ring, rings, arcs) {
  var bbox = arcs.getSimpleShapeBounds2(ring);
  var sibling, p;
  for (var i=0, n=rings.length; i<n; i++) {
    sibling = rings[i];
    // try to avoid expensive point-in-ring test
    if (sibling && sibling != ring && ringIntersectsBBox(sibling, bbox, arcs)) {
      p = arcs.getVertex(sibling[0], 0);
      if (geom.testPointInRing(p.x, p.y, ring, arcs)) {
        return true;
      }
    }
  }
  return false;
}
