/* @require mapshaper-polygon-intersection */

// Currently only removes self-intersections
//
MapShaper.repairPolygonGeometry = function(layers, dataset, opts) {
  var nodes = MapShaper.divideArcs(dataset.layers, dataset.arcs);
  layers.forEach(function(lyr) {
    MapShaper.repairSelfIntersections(lyr, nodes);
  });
  return layers;
};

// Remove pairs of ids where id[n] == ~id[n+1] or id[0] == ~id[n-1];
// (in place)
MapShaper.removeSpikesInPath = function(ids) {
  var n = ids.length;
  for (var i=1; i<n; i++) {
    if (ids[i-1] == ~ids[i]) {
      ids.splice(i-1, 2);
      MapShaper.removeSpikesInPath(ids);
    }
  }
  if (n > 2 && ids[0] == ~ids[n-1]) {
    ids.pop();
    ids.shift();
    MapShaper.removeSpikesInPath(ids);
  }
};

MapShaper.cleanPath = function(path, arcs) {
  var nulls = 0;
  for (var i=0; i<path.length; i++) {
    if (arcs.arcIsDegenerate(path[i])) {
      nulls++;
      path[i] = null;
    }
  }
  return nulls > 0 ? path.filter(function(id) {return id !== null;}) : path;
};

// Remove defective arcs and zero-area polygon rings
// Don't remove duplicate points
// Don't remove spikes (between arcs or within arcs)
// Don't check winding order of polygon rings
MapShaper.cleanShape = function(shape, arcs, type) {
  return MapShaper.editPaths(shape, function(path) {
    var cleaned = MapShaper.cleanPath(path, arcs);
    if (type == 'polygon' && cleaned) {
      MapShaper.removeSpikesInPath(cleaned); // assumed by divideArcs()
      if (geom.getPathArea4(cleaned, arcs) === 0) {
        cleaned = null;
      }
    }
    return cleaned;
  });
};

// clean polygon or polyline shapes, in-place
MapShaper.cleanShapes = function(shapes, arcs, type) {
  for (var i=0, n=shapes.length; i<n; i++) {
    shapes[i] = MapShaper.cleanShape(shapes[i], arcs, type);
  }
};

// Remove any small shapes formed by twists in each ring
// Retain only the part with largest area
// TODO: consider cases where cut-off parts should be retained
//
MapShaper.repairSelfIntersections = function(lyr, nodes) {
  var splitter = MapShaper.getPathSplitter(nodes);

  lyr.shapes = lyr.shapes.map(function(shp, i) {
    return shp ? cleanPolygon(shp) : null;
  });

  function cleanPolygon(shp) {
    var cleanedPolygon = [];
    MapShaper.forEachPath(shp, function(ids) {
      // TODO: consider returning null if path can't be split
      var splitIds = splitter(ids);
      if (splitIds.length === 0) {
        error("[cleanPolygon()] Defective path:", ids);
      } else if (splitIds.length == 1) {
        cleanedPolygon.push(splitIds[0]);
      } else {
        var shapeArea = geom.getPathArea4(ids, nodes.arcs),
            sign = shapeArea > 0 ? 1 : -1,
            mainRing;
        var maxArea = splitIds.reduce(function(maxArea, ringIds, i) {
          var pathArea = geom.getPathArea4(ringIds, nodes.arcs) * sign;
          // console.log("... split area:", pathArea)
          if (pathArea > maxArea) {
            mainRing = ringIds;
            maxArea = pathArea;
          }
          return maxArea;
        }, 0);
        // console.log("ringArea:", shapeArea, "maxPart:", maxArea)
        if (mainRing) {
          cleanedPolygon.push(mainRing);
        }
      }
    });
    return cleanedPolygon;
  }
};


MapShaper.getPathSplitter = function(nodes) {
  var arcs = nodes.arcs;
  var flags = new Uint8Array(arcs.size());

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
    var bits = getRouteBits(id, flags);
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
    // console.log(" -> extending:", firstId, "ids:", ids, 'i:', i)

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
    // console.log(" ... extended route:", route)
    return route;
  }

  function dividePathAtNode(arcId, ids) {
    var startIds = findMultipleRoutes(arcId),
        routes;
    if (!startIds) return null;
    // got two or more branches... extend them
    startIds.forEach(function(startId) {
      // close this route, to avoid cycles
      closeRoute(startId);
      var routeIds = extendRoute(startId, ids);
      if (routeIds.length >= ids.length) {
        error("[dividePathAtNode()] Caught in a cycle");
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
