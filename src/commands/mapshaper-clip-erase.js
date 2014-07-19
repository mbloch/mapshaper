/* @requires
mapshaper-merging,
mapshaper-dataset-utils
mapshaper-polygon-intersection
mapshaper-polygon-repair
*/

api.clipPolygonLayers = function(target, clipLyr, dataset, opts) {
  return MapShaper.intersectLayers(target, clipLyr, dataset, "clip", opts);
};

api.erasePolygonLayers = function(target, clipLyr, dataset, opts) {
  return MapShaper.intersectLayers(target, clipLyr, dataset, "erase", opts);
};

api.clipPolygons = function(targetLyr, clipLyr, dataset, opts) {
  return api.clipPolygonLayers([targetLyr], clipLyr, dataset, opts)[0];
};

api.erasePolygons = function(targetLyr, clipLyr, dataset, opts) {
  return api.erasePolygonLayers([targetLyr], clipLyr, dataset, opts)[0];
};

// @target: a single layer or an array of layers
// @type: 'clip' or 'erase'
MapShaper.intersectLayers = function(targetLayers, clipLyr, dataset, type, opts) {
  MapShaper.requirePolygonLayer(clipLyr, "Expected a polygon type " + type + " layer");
  targetLayers.forEach(function(lyr) {
    MapShaper.requirePolygonLayer(lyr, "[" + type + "] only supports polygon type layers");
  });

  var allLayers = dataset.layers;
  // If clipping layer was imported from a second file, it won't be included in
  //  dataset.layers -- assuming that clipLyr arcs have been merged with dataset.arcs
  //
  if (Utils.contains(dataset.layers, clipLyr) === false) {
    allLayers = [clipLyr].concat(allLayers);
  }
  var nodes = MapShaper.divideArcs(allLayers, dataset.arcs);

  // remove any self-intersections in clip and target layers
  MapShaper.repairSelfIntersections(clipLyr, nodes);
  targetLayers.forEach(function(lyr) {
    MapShaper.repairSelfIntersections(lyr, nodes);
  });

  var output = targetLayers.map(function(targetLyr) {
    return MapShaper.intersectTwoLayers(targetLyr, clipLyr, nodes, type, opts);
  });
  return output;
};

// assumes layers and arcs have been prepared for clipping
MapShaper.intersectTwoLayers = function(targetLyr, clipLyr, nodes, type, opts) {
  if (targetLyr.geometry_type != 'polygon' || clipLyr.geometry_type != 'polygon') {
    stop("[intersectLayers()] Expected two polygon layers, received",
      targetLyr.geometry_type, "and", clipLyr.geometry_type);
  }

  // DON'T DISSOLVE -- current dissolve function may fail if clip shapes contain
  //   overlaps or self-intersections.
  // var clipShapes = MapShaper.dissolveShapes(clipLyr.shapes, arcs);
  var clipShapes = clipLyr.shapes;
  var arcs = nodes.arcs;

  var clipFlags = new Uint8Array(arcs.size());
  // Open pathways in the clip/erase layer
  // Need to expose clip/erase routes in both directions by setting route
  // in both directions to visible -- this is how cut-out shapes are detected
  // Or-ing with 0x11 makes both directions visible
  MapShaper.openArcRoutes(clipShapes, arcs, clipFlags, type == 'clip', type == 'erase', !!"dissolve", 0x11);

  var routeFlags = new Uint8Array(arcs.size());
  var clipArcTouches = 0;
  var usedClipArcs = [];
  var dividePath = MapShaper.getPathFinder(nodes, useRoute, routeIsActive, chooseRoute2);
  var dividedShapes = clipPolygons(targetLyr.shapes, clipShapes, arcs, type);
  var dividedLyr = Utils.defaults({shapes: dividedShapes, data: null}, targetLyr);

  if (targetLyr.data) {
    dividedLyr.data = opts.no_replace ? targetLyr.data.clone() : targetLyr.data;
  }
  return dividedLyr;

  function clipPolygons(targetShapes, clipShapes, arcs, type) {
    var index = new PathIndex(clipShapes, arcs);
    var clippedShapes = targetShapes.map(function(shape) {
      return shape ? clipPolygon(shape, type, index) : null;
    });

    // add clip/erase polygons that are fully contained in a target polygon
    // need to index only non-intersecting clip shapes
    // (Intersecting shapes have one or more arcs that have been scanned)
    //
    var undividedClipShapes = findUndividedClipShapes();
    MapShaper.closeArcRoutes(clipShapes, arcs, routeFlags, true, true); // not needed?
    index = new PathIndex(undividedClipShapes, arcs);
    targetShapes.forEach(function(shape, shapeId) {
      var paths = findInteriorPaths(shape, type, index);
      if (paths) {
        clippedShapes[shapeId] = (clippedShapes[shapeId] || []).concat(paths);
      }
    });

    return clippedShapes;
  }

  function clipPolygon(shape, type, index) {
    var dividedShape = [],
        clipping = type == 'clip',
        erasing = type == 'erase';

    // console.log(flagsToArray(routeFlags), "a. pre-clip");

    // open pathways for entire polygon rather than one ring at a time --
    // need to create polygons that connect positive-space rings and holes
    MapShaper.openArcRoutes(shape, arcs, routeFlags, true, false, false);

    // console.log(flagsToArray(routeFlags), "b. target shape opened");

    MapShaper.forEachPath(shape, function(ids) {
      var path;
      for (var i=0, n=ids.length; i<n; i++) {
        clipArcTouches = 0;
        path = dividePath(ids[i]);

        if (path) {
          // if ring doesn't touch/intersect a clip/erase polygon, check if it is contained
          if (clipArcTouches === 0) {
            var contained = index.pathIsEnclosed(path);
            if (clipping && contained || erasing && !contained) {
              dividedShape.push(path);
            }
            // TODO: Consider breaking if polygon is unchanged
          } else {
            dividedShape.push(path);
          }
        }
      }
    });

    // console.log(flagsToArray(routeFlags), "c. post clip");

    // Clear pathways of current target shape to hidden/closed
    MapShaper.closeArcRoutes(shape, arcs, routeFlags, true, true, true);
    // Also clear pathways of any clip arcs that were used
    if (usedClipArcs.length > 0) {
      MapShaper.closeArcRoutes(usedClipArcs, arcs, routeFlags, true, true, true);
      usedClipArcs = [];
    }

    // console.log(flagsToArray(routeFlags), "d. target shape closed");

    return dividedShape.length === 0 ? null : dividedShape;
  }

  function routeIsActive(id) {
    var fw = id >= 0,
        abs = fw ? id : ~id,
        visibleBit = fw ? 1 : 0x10,
        targetBits = routeFlags[abs],
        clipBits = clipFlags[abs];

    if (clipBits > 0) clipArcTouches++;
    return (targetBits & visibleBit) > 0 || (clipBits & visibleBit) > 0;
  }

  function useRoute(id) {
    var fw = id >= 0,
        abs = fw ? id : ~id,
        targetBits = routeFlags[abs],
        clipBits = clipFlags[abs],
        targetRoute, clipRoute;

    if (fw) {
      targetRoute = targetBits;
      clipRoute = clipBits;
    } else {
      targetRoute = targetBits >> 4;
      clipRoute = clipBits >> 4;
    }
    targetRoute &= 3;
    clipRoute &= 3;

    var usable = false;
    // var usable = targetRoute === 3 || targetRoute === 0 && clipRoute == 3;
    if (targetRoute == 3) {
      // special cases where clip route and target route both follow this arc
      if (clipRoute == 1) {
        // 1. clip/erase polygon blocks this route
        // usable = false;
      } else if (clipRoute == 2 && type == 'erase') {
        // 2. route is on the boundary between two erase polygons
        // usable = false;
      } else {
        targetBits |= fw ? 4 : 0x40;
        usable = true;
      }

      // Need to close all arcs after visiting them -- or could cause a cycle
      //   on layers with strange topology
      // updatedRoute = 5; // set to visible / closed / used;
      // updatedRoute = 4; // set to invisible / closed / used;

      // routeFlags[abs] ^= (fw ? 2 : 0x20);
      //if (fw) {
        // routeFlags[abs] = MapShaper.setBits(targetBits, updatedRoute, 0x7);
      //} else {
        // routeFlags[abs] = MapShaper.setBits(targetBits, updatedRoute << 4, 0x70);
      // }
    } else if (targetRoute === 0 && clipRoute == 3) {
      usedClipArcs.push(id);
      // routeFlags[abs] ^= fw ? 2 : 0x20;
      clipFlags[abs] |= fw ? 4 : 0x40;
      usable = true;
    }

    if (usable) {
      // block route
      if (fw) {
        routeFlags[abs] = MapShaper.setBits(targetBits, 1, 3);
      } else {
        routeFlags[abs] = MapShaper.setBits(targetBits, 0x10, 0x30);
      }
    }
    return usable;
  }


  function chooseRoute2(id1, angle1, id2, angle2, prevId) {
    var selection = 1,
        bitsPrev = getRouteBits(prevId, routeFlags),
        bits1 = getRouteBits(id1, routeFlags),
        bits2 = getRouteBits(id2, routeFlags),
        fromTarg = (bitsPrev & 4) == 4,
        targ1 = (bits1 & 1) == 1,
        targ2 = (bits2 & 1) == 1;

    if (angle1 == angle2) {
      // less likely now that congruent arcs are prevented in updateArcIds()
      if (bits2 == 3) { // route2 follows a target layer arc; prefer it
        selection = 2;
      }
    } else {
      // prefer right-hand angle
      if (angle2 < angle1) {
        selection = 2;
      }
    }

    // console.log("id1:", id1, "id2:", id2, "sel:", selection, "a1:", angle1, "a2", angle2)
    return selection;
  }

  function chooseRoute(a, b) {
    var route = a,
        bi = absArcId(b);

    if ((routeFlags[bi] & 3) == 3) { // prefer routes from target layer
      route = b;
    }
    return route;
  }

  // Filter a collection of shapes to exclude paths that were modified by clipping
  // and paths that are hidden (e.g. internal boundaries)
  function findUndividedClipShapes() {
    return clipShapes.map(function(shape) {
      var usableParts = [];
      MapShaper.forEachPath(shape, function(ids) {
        var pathIsClean = true,
            pathIsVisible = false;
        for (var i=0; i<ids.length; i++) {
          // check if arc was used in fw or rev direction
          if (!arcIsUnused(ids[i], clipFlags)) {
            pathIsClean = false;
            break;
          }
          // check if clip arc is visible
          if (!pathIsVisible && arcIsVisible(ids[i], clipFlags)) {
            pathIsVisible = true;
          }
        }
        if (pathIsClean && pathIsVisible) usableParts.push(ids);
      });
      return usableParts.length > 0 ? usableParts : null;
    });
  }

  // Test if arc is unused in both directions
  // (not testing open/closed or visible/hidden)
  function arcIsUnused(id, flags) {
    var flag = flags[absArcId(id)];
    return (flag & 0x44) === 0;
  }

  function arcIsVisible(id, flags) {
    var flag = flags[absArcId(id)];
    return (flag & 0x11) > 0;
  }

  // search for indexed clipping paths contained in a shape
  // dissolve them if needed
  function findInteriorPaths(shape, type, index) {
    var enclosedPaths = index.findPathsInsideShape(shape),
        dissolvedPaths = [];
    if (!enclosedPaths) return null;
    // ...
    if (type == 'erase') enclosedPaths.forEach(MapShaper.reversePath);
    if (enclosedPaths.length <= 1) {
      dissolvedPaths = enclosedPaths; // no need to dissolve single-part paths
    } else {
      MapShaper.openArcRoutes(enclosedPaths, arcs, routeFlags, true, false, true);
      enclosedPaths.forEach(function(ids) {
        var path;
        for (var j=0; j<ids.length; j++) {
          path = dividePath(ids[j]);
          if (path) {
            dissolvedPaths.push(path);
          }
        }
      });
    }

    return dissolvedPaths.length > 0 ? dissolvedPaths : null;
  }
}; // end intersectLayers()
