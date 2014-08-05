/* @requires mapshaper-flatten, mapshaper-divide */


api.dissolvePolygonLayers2 = function(layers, dataset, opts) {
  var nodes = MapShaper.divideArcs(dataset.layers, dataset.arcs);
  var dissolvedLayers = layers.map(function(lyr) {
    var shapes2 = MapShaper.dissolvePolygons2(lyr.shapes, nodes);
    return Utils.defaults({shapes: shapes2, data: null}, lyr);
  });
  return dissolvedLayers;
};

MapShaper.dissolvePolygons2 = function(shapes, nodes) {
  var rings = MapShaper.concatShapes(shapes);
  var dissolve = MapShaper.getPolygonDissolver(nodes);
  var dissolved = dissolve(rings);
  return [dissolved];
};

MapShaper.concatShapes = function(shapes) {
  return shapes.reduce(function(memo, shape) {
    if (shape) {
      for (var i=0, n=shape.length; i<n; i++) {
        memo.push(shape[i]);
      }
    }
    return memo;
  }, []);
};

MapShaper.getPolygonDissolver = function(nodes) {
  var flags = new Uint8Array(nodes.arcs.size());
  var split = MapShaper.getPathSplitter(nodes, flags);
  var flatten = MapShaper.getRingFlattener(nodes, flags);
  var dissolve = MapShaper.getCleanPolygonDissolver(nodes, flags);

  return function(shp) {
    if (!shp) return null;
    var cw = [],
        ccw = [];

    MapShaper.dividePolygon(shp, nodes, cw, ccw, split);
    cw = flatten(cw);
    ccw.forEach(MapShaper.reversePath);
    ccw = flatten(ccw);
    ccw.forEach(MapShaper.reversePath);

    var shp2 = MapShaper.appendHolestoRings(cw, ccw);
    var dissolved = dissolve(shp2);
    return dissolved.length > 0 ? dissolved : null;
  };
};

MapShaper.dividePolygon = function(shp, nodes, cw, ccw, splitter) {
  var cleanedPolygon = [];
  MapShaper.forEachPath(shp, function(ids) {
    var splitIds = splitter(ids);
    if (splitIds.length === 0) {
      error("[cleanPolygon()] Defective path:", ids);
    }
    // if (splitIds.length > 1) console.log("split one path into", splitIds.length, "paths");
    splitIds.forEach(function(ringIds, i) {
      var ringArea = geom.getPathArea4(ringIds, nodes.arcs);
      if (ringArea > 0) {
        cw.push(ringIds);
      } else if (ringArea < 0) {
        ccw.push(ringIds);
      }
    });
  });
};


// Returns a function for flattening a collection of polygon rings
// Rings are assumed to be oriented in the same direction (all CW or all CCW)
// Rings may overlap each other, but should be free of self-intersections
//
MapShaper.getRingFlattener = function(nodes, flags) {
  var arcs = nodes.arcs;
  flags = flags || new Uint8Array(arcs.size());
  var findPath = MapShaper.getPathFinder(nodes, useRoute, routeIsActive, chooseRoute);

  function useRoute(arcId) {
    var route = MapShaper.getRouteBits(arcId, flags),
        isOpen = false;

    if (route == 3) {
      isOpen = true;
      MapShaper.setRouteBits(1, arcId, flags); // close the path, leave visible
    }
    return isOpen;
  }

  function routeIsActive(arcId) {
    var bits = MapShaper.getRouteBits(arcId, flags);
    return bits > 0;
  }

  function chooseRoute(id1, angle1, id2, angle2, prevId) {
    var route = 1;
    if (angle1 == angle2) {
      trace("[getRingFlattener()] parallel routes, unsure which to choose");
      //MapShaper.debugRoute(id1, id2, nodes.arcs);
      //nodes.debugNode(~id1);
    } else if (angle2 < angle1) {
      route = 2;
    }
    // console.log("choose() from:", prevId, "a:", id1, angle1, "b:", id2, angle2);
    return route;
  }

  return function(rings) {
    var dissolved;
    if (rings.length > 1) {
      dissolved = [];
      // open in fw direction
      MapShaper.openArcRoutes(rings, arcs, flags, true, true, false);
      MapShaper.forEachPath(rings, function(ids) {
        var path;
        for (var i=0, n=ids.length; i<n; i++) {
          path = findPath(ids[i]);
          if (path) {
            dissolved.push(path);
          }
        }
      });
      MapShaper.closeArcRoutes(rings, arcs, flags, true, true, true);
    }
    return dissolved || rings;
  };
};

MapShaper.getCleanPolygonDissolver = function(nodes, flags) {

  var arcs = nodes.arcs;
  flags = flags || new Uint8Array(arcs.size());
  var findPath = MapShaper.getPathFinder(nodes, useRoute, routeIsActive, chooseRoute);

  function useRoute(arcId) {
    var route = MapShaper.getRouteBits(arcId, flags),
        isOpen = false;

    if (route == 3) {
      isOpen = true;
      MapShaper.setRouteBits(1, arcId, flags); // close the path, leave visible
    }
    return isOpen;
  }

  function routeIsActive(arcId) {
    var bits = MapShaper.getRouteBits(arcId, flags);
    return (bits & 1) == 1;
  }

  function chooseRoute(id1, angle1, id2, angle2, prevId) {
    var route = 1;
    if (angle1 == angle2) {
      trace("[getCleanPolygonDissolver()] parallel routes, unsure which to choose");
      //console.log("  ", prevId, "> a:", ~id1, angle1, "b:", ~id2, angle2);
      //MapShaper.debugRoute(id1, id2, nodes.arcs);
    } else if (angle2 < angle1) {
      route = 2;
    }
    return route;
  }

  return function(rings) {
    var dissolved;
    if (rings.length > 1) {
      dissolved = [];
      // open in fw direction
      MapShaper.openArcRoutes(rings, arcs, flags, true, false, true);
      MapShaper.forEachPath(rings, function(ids) {
        var path;
        for (var i=0, n=ids.length; i<n; i++) {
          path = findPath(ids[i]);
          if (path) {
            dissolved.push(path);
          }
        }
      });
      MapShaper.closeArcRoutes(rings, arcs, flags, true, false, true);
    }
    return dissolved || rings;
  };
};

// Given two arcs, where first segments are parallel, choose the one that
// bends CW
// return 0 if can't pick
//
MapShaper.debugRoute = function(id1, id2, arcs) {
  var n1 = arcs.getArcLength(id1),
      n2 = arcs.getArcLength(id2),
      len1 = 0,
      len2 = 0,
      p1, p2, pp1, pp2, ppp1, ppp2,
      angle1, angle2;

      console.log("chooseRoute() lengths:", n1, n2, 'ids:', id1, id2);
  for (var i=0; i<n1 && i<n2; i++) {
    p1 = arcs.getVertex(id1, i);
    p2 = arcs.getVertex(id2, i);
    if (i === 0) {
      if (p1.x != p2.x || p1.y != p2.y) {
        error("chooseRoute() Routes should originate at the same point)");
      }
    }

    if (i > 1) {
      angle1 = signedAngle(ppp1.x, ppp1.y, pp1.x, pp1.y, p1.x, p1.y);
      angle2 = signedAngle(ppp2.x, ppp2.y, pp2.x, pp2.y, p2.x, p2.y);

      console.log("angles:", angle1, angle2, 'lens:', len1, len2);
      // return;
    }

    if (i >= 1) {
      len1 += distance2D(p1.x, p1.y, pp1.x, pp1.y);
      len2 += distance2D(p2.x, p2.y, pp2.x, pp2.y);
    }

    if (i == 1 && (n1 == 2 || n2 == 2)) {
      console.log("arc1:", pp1, p1, "len:", len1);
      console.log("arc2:", pp2, p2, "len:", len2);
    }

    ppp1 = pp1;
    ppp2 = pp2;
    pp1 = p1;
    pp2 = p2;
  }
  return 1;
};


// TODO: to prevent invalid holes,
//   we shoudl erase the holes from the space-enclosing rings.
MapShaper.appendHolestoRings = function(cw, ccw) {
  for (var i=0, n=ccw.length; i<n; i++) {
    cw.push(ccw[i]);
  }
  return cw;
};
