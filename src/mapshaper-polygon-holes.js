/* @require mapshaper-polygon-intersection */

// Returns a function that separates rings in a polygon into space-enclosing rings
// and holes. Also fixes self-intersections.
//
MapShaper.getHoleDivider = function(nodes, flags) {
  var split = MapShaper.getSelfIntersectionSplitter(nodes, flags);

  return function(rings, cw, ccw) {
    MapShaper.forEachPath(rings, function(ringIds) {
      var splitRings = split(ringIds);
      if (splitRings.length === 0) {
        trace("[getRingDivider()] Defective path:", ringIds);
      }
      splitRings.forEach(function(ringIds, i) {
        var ringArea = geom.getPathArea4(ringIds, nodes.arcs);
        if (ringArea > 0) {
          cw.push(ringIds);
        } else if (ringArea < 0) {
          ccw.push(ringIds);
        }
      });
    });
  };
};

// Return function for splitting self-intersecting polygon rings
// Returned function receives a single path, returns an array of paths
// Assumes that any intersections occur at vertices, not along segments
// (requires that MapShaper.divideArcs() has already been run)
//
MapShaper.getSelfIntersectionSplitter = function(nodes, flags) {
  var arcs = nodes.arcs;
  flags = flags || new Uint8Array(arcs.size());

  function findMultipleRoutes(id) {
    var count = 0,
        firstRoute,
        routes;
    nodes.forEachConnectedArc(id, function(candId) {
      if (isOpenRoute(~candId)) {
        if (count === 0) {
          firstRoute = ~candId;
        } else if (count === 1) {
          routes = [firstRoute, ~candId];
        } else {
          routes.push(~candId);
        }
        count++;
      }
    });

    return routes || null;
  }

  function isOpenRoute(id) {
    var bits = MapShaper.getRouteBits(id, flags);
    return bits == 3;
  }

  function closeRoute(id) {
    var abs = absArcId(id);
    flags[abs] &= abs == id ? ~3 : ~0x30;
  }

  function routeIsComplete(arcId, firstId) {
    var complete = false;
    nodes.forEachConnectedArc(arcId, function(candId) {
      if (~candId === firstId) {
        complete = true;
      }
    });
    return complete;
  }

  function extendRoute(firstId, ids) {
    var i = ids.indexOf(firstId),
        n = ids.length,
        count = 0,
        route = [firstId],
        nextId = firstId;

    if (i === -1) error("[extendRoute()] Path is missing id:", firstId);

    while (routeIsComplete(nextId, firstId) === false) {
      if (++count > n) {
        error("[extendRoute()] Caught in a cycle");
      }
      i = (i + 1) % n;
      nextId = ids[i];
      route.push(nextId);
      // edge case: lollipop shape
      // remove spike and finish route
      // THIS REMOVES 'NECK' SHAPES -- make sure we really want this
      if (nextId == ~firstId) {
        MapShaper.removeSpikesInPath(route);
        break;
      }
    }
    return route;
  }

  function dividePathAtNode(arcId, ids) {
    var startIds = findMultipleRoutes(arcId),
        routes;
    if (!startIds) return null;
    // got two or more branches... extend them
    // close routes, to avoid cycles...
    startIds.forEach(closeRoute);
    startIds.forEach(function(startId) {
      var routeIds = extendRoute(startId, ids);
      if (routeIds.length >= ids.length) {
        error("[dividePathAtNode()] Caught in a cycle; arc id:", arcId);
      }
      // subdivide this branch
      var splits = dividePath(routeIds);
      routes = routes ? routes.concat(splits) : splits;
    });

    return routes;
  }

  function dividePath(ids) {
    var splits;
    for (var i=0, lim = ids.length - 1; i<lim; i++) {
      splits = dividePathAtNode(ids[i], ids);
      if (splits) return splits;
    }
    return [ids];
  }

  return function(ids) {
    MapShaper.openArcRoutes(ids, arcs, flags, true, false, false, 0x11);
    var paths = dividePath(ids);
    MapShaper.closeArcRoutes(ids, arcs, flags, true, true, true);
    return paths;
  };
};
