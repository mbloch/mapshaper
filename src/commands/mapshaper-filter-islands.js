/* @requires mapshaper-shape-geom, mapshaper-filter, mapshaper-shape-utils */

api.filterIslands = function(lyr, arcs, opts) {
  var removed = 0;
  if (lyr.geometry_type != 'polygon') {
    return;
  }

  if (opts.min_area || opts.min_vertices) {
    if (opts.min_area) {
      removed += MapShaper.filterIslands(lyr, arcs, MapShaper.getRingAreaTest(opts.min_area, arcs));
    }
    if (opts.min_vertices) {
      removed += MapShaper.filterIslands(lyr, arcs, MapShaper.getVertexCountTest(opts.min_vertices, arcs));
    }
    if (opts.remove_empty) {
      api.filterFeatures(lyr, arcs, {remove_empty: true, verbose: false});
    }
    message(utils.format("Removed %'d island%s", removed, utils.pluralSuffix(removed)));
  } else {
    message("[filter-islands] Missing a criterion for filtering islands; use min-area or min-vertices");
  }
};

MapShaper.getVertexCountTest = function(minVertices, arcs) {
  return function(path) {
    // first and last vertex in ring count as one
    return geom.countVerticesInPath(path, arcs) <= minVertices;
  };
};

MapShaper.getRingAreaTest = function(minArea, arcs) {
  var pathArea = arcs.isPlanar() ? geom.getPlanarPathArea : geom.getSphericalPathArea;
  return function(path) {
    var area = pathArea(path, arcs);
    return Math.abs(area) < minArea;
  };
};

MapShaper.filterIslands = function(lyr, arcs, ringTest) {
  var removed = 0;
  var counts = new Uint8Array(arcs.size());
  MapShaper.countArcsInShapes(lyr.shapes, counts);

  var pathFilter = function(path, i, paths) {
    if (path.length == 1) { // got an island ring
      if (counts[absArcId(path[0])] === 1) { // and not part of a donut hole
        if (!ringTest || ringTest(path)) { // and it meets any filtering criteria
          // and it does not contain any holes itself
          // O(n^2), so testing this last
          if (!MapShaper.ringHasHoles(path, paths, arcs)) {
            removed++;
            return null;
          }
        }
      }
    }
  };
  MapShaper.filterShapes(lyr.shapes, pathFilter);
  return removed;
};

MapShaper.ringIntersectsBBox = function(ring, bbox, arcs) {
  for (var i=0, n=ring.length; i<n; i++) {
    if (arcs.arcIntersectsBBox(absArcId(ring[i]), bbox)) {
      return true;
    }
  }
  return false;
};

// Assumes that ring boundaries to not cross
MapShaper.ringHasHoles = function(ring, rings, arcs) {
  var bbox = arcs.getSimpleShapeBounds2(ring);
  var sibling, p;
  for (var i=0, n=rings.length; i<n; i++) {
    sibling = rings[i];
    // try to avoid expensive point-in-ring test
    if (sibling && sibling != ring && MapShaper.ringIntersectsBBox(sibling, bbox, arcs)) {
      p = arcs.getVertex(sibling[0], 0);
      if (geom.testPointInRing(p.x, p.y, ring, arcs)) {
        return true;
      }
    }
  }
  return false;
};

MapShaper.filterShapes = function(shapes, pathFilter) {
  var shapeFilter = function(paths) {
    return MapShaper.editPaths(paths, pathFilter);
  };
  for (var i=0, n=shapes.length; i<n; i++) {
    shapes[i] = shapeFilter(shapes[i]);
  }
};
