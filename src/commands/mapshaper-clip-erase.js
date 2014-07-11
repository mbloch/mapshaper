/* @requires
mapshaper-merging,
mapshaper-dataset-utils
mapshaper-polygon-intersection
*/

api.clipLayer = function(targetLyr, clipLyr, arcs, opts) {
  return MapShaper.intersectLayers(targetLyr, clipLyr, arcs, "clip", opts);
};

api.eraseLayer = function(targetLyr, clipLyr, arcs, opts) {
  return MapShaper.intersectLayers(targetLyr, clipLyr, arcs, "erase", opts);
};

// @src either a file containing polygons or the name/id of a polygon layer
MapShaper.prepareClippingLayer = function(src, dataset) {
  var match = MapShaper.findMatchingLayers(dataset.layers, src),
      layers = dataset.layers,
      clipLyr;
  if (match.length > 1) {
    stop("[prepareClippingLayer()] Clipping source must be a single layer");
  } else if (match.length == 1) {
    clipLyr = match[0];
    layers = dataset.layers;
  } else {
    var clipData = api.importFile(src);
    dataset.arcs = MapShaper.mergeDatasets([dataset, clipData]).arcs;
    clipLyr = clipData.layers[0];
    layers = layers.concat(clipLyr);
  }
  MapShaper.divideArcs(layers, dataset.arcs);
  return clipLyr;
};

// @type: 'clip' or 'erase'
MapShaper.intersectLayers = function(targetLyr, clipLyr, arcs, type, opts) {
  if (targetLyr.geometry_type != 'polygon' || clipLyr.geometry_type != 'polygon') {
    stop("[intersectLayers()] Expected two polygon layers, received",
      targetLyr.geometry_type, "and", clipLyr.geometry_type);
  }

  // DON'T DISSOLVE -- current dissolve function may fail if clip shapes contain
  //   overlaps or self-intersections.
  // var clipShapes = MapShaper.dissolveShapes(clipLyr.shapes, arcs);
  var clipShapes = clipLyr.shapes;

  var clipFlags = new Uint8Array(arcs.size());
  // Open pathways in the clip/erase layer
  // Need to expose clip/erase routes in both directions by setting route
  // in both directions to visible -- this is how cut-out shapes are detected
  // Or-ing with 0x11 makes both directions visible
  MapShaper.openArcRoutes(clipShapes, arcs, clipFlags, type == 'clip', type == 'erase', !!"dissolve", 0x11);

  var routeFlags = new Uint8Array(arcs.size());
  var clipArcTouches = 0;
  var dividePath = MapShaper.getPathFinder(arcs, useRoute, routeIsActive, chooseRoute);
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
    // TODO; handle topology... need to dissolve?
    // TODO: find undivided paths or shapes?
    //
    // var undividedClipShapes = findUndividedShapes(clipShapes, clipFlags);
    // save used clip arcs to routeFlags also
    var undividedClipShapes = findUndividedShapes(clipShapes);
    MapShaper.closeArcRoutes(clipShapes, arcs, routeFlags, true, true); // not needed?
    index = new PathIndex(undividedClipShapes, arcs);
    targetShapes.forEach(function(shape, shapeId) {
      var paths = findInteriorPaths(shape, type, index);
      if (paths) {
        clippedShapes[shapeId] = (clippedShapes[shapeId] || []).concat(paths);
      }
    });

    // Re-open clip pathways along divided path.
    //   (i.e. re-set any pathways in clipping layer that were just consumed)
    /*
    if (usedClipArcs.length > 0) {
      error("nope")
      resetClippingFlags(usedClipArcs);
      usedClipArcs = [];
    }
    */
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
      for (var i=0; i<ids.length; i++) {
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

    // Set pathways of current target shape to hidden/closed in fwd direction
    MapShaper.closeArcRoutes(shape, arcs, routeFlags, true, false, true);

    // console.log(flagsToArray(routeFlags), "d. target shape closed");

    return dividedShape.length === 0 ? null : dividedShape;
  }

  function resetClippingFlags(ids) {
    MapShaper.forEachArcId(ids, function(id) {
      var abs = absArcId(id);
      routeFlags[abs] = MapShaper.setBits(routeFlags[abs], clipFlags[abs], 0x33); // retain used bit and marker bit
    });
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
        targetRoute, clipRoute, updatedRoute;

    if (fw) {
      targetRoute = targetBits;
      clipRoute = clipBits;
    } else {
      targetRoute = targetBits >> 4;
      clipRoute = clipBits >> 4;
    }
    targetRoute &= 3;
    clipRoute &= 3;

    var usable = targetRoute === 3 || targetRoute === 0 && clipRoute == 3;
    if (usable) {
      // special cases where clip route and target route both follow this arc
      if (clipRoute == 1) {
        // 1. clip/erase polygon blocks this route
        usable = false;
      } else if (clipRoute == 2 && type == 'erase') {
        // 2. route is on the boundary between two erase polygons
        usable = false;
      }

      // Need to close all arcs after visiting them -- or could cause a cycle
      //   on layers with strange topology
      updatedRoute = 5; // set to visible / closed / used;
      // updatedRoute = 4; // set to invisible / closed / used;

      if (fw) {
        routeFlags[abs] = MapShaper.setBits(targetBits, updatedRoute, 0x7);
      } else {
        routeFlags[abs] = MapShaper.setBits(targetBits, updatedRoute << 4, 0x70);
      }
    }
    return usable;
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
  function findUndividedShapes(shapes) {
    return shapes.map(function(shape) {
      var usableParts = [];
      MapShaper.forEachPath(shape, function(ids) {
        var pathIsClean = true,
            pathIsVisible = false;
        for (var i=0; i<ids.length; i++) {
          // check if arc was used in fw or rev direction
          if (!arcIsUnused(ids[i], routeFlags)) {
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
