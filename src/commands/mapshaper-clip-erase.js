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

  //console.log('### target shapes:', targetLyr.shapes)
  //console.log('### clip shapes:', clipShapes);

  var flags = new Uint8Array(arcs.size());
  var dividePath = MapShaper.getPathFinder(arcs, flags);
  var dividedShapes = clipPolygons(targetLyr.shapes, clipShapes, arcs, type);
  var dividedLyr = Utils.defaults({shapes: dividedShapes, data: null}, targetLyr);

  if (targetLyr.data) {
    dividedLyr.data = opts.no_replace ? targetLyr.data.clone() : targetLyr.data;
  }
  return dividedLyr;

  function clipPolygons(targetShapes, clipShapes, arcs, type) {
    // console.log("clip shapes:", clipShapes)
    /*
    var arr = arcs.toArray();
    clipShapes[0][0].forEach(function(id) {
      console.log(">", id, " n:", arcs.getArcLength(id));
      console.log("  . ", arr[absArcId(id)]);
    });
    */

    // Open pathways in the clip/erase layer
    // Essential to block clip/erase shapes in both directions by setting both open
    // and closed sides of each arc to visible -- this is how cut-out shapes are detected
    // 0x11 bits set both directions to visible
    // use 0x80 bit to mark these pathways as belonging to the clipping layer
    //
    MapShaper.openArcPathways(clipShapes, arcs, flags, type == 'clip', type == 'erase', !!"dissolve", 0x80 | 0x11);
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
    var undividedClipShapes = findUndividedShapes(clipShapes, flags);
    MapShaper.closeArcPathways(clipShapes, arcs, flags, true, true); // not needed?
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

    // open pathways for entire shape rather than one path at a time --
    // need to create polygons that connect positive-space rings and holes
    MapShaper.openArcPathways(shape, arcs, flags, true, false, false, 0x8);

    MapShaper.forEachPath(shape, function(ids) {
      var path;
      for (var i=0; i<ids.length; i++) {
        path = dividePath(ids[i]);

        if (path) {
          // if ring doesn't touch/intersect a clip/erase polygon, check if it is contained
          if (dividePath.marked === false) {
            var contained = index.pathIsEnclosed(path);
            if (clipping && contained || erasing && !contained) {
              dividedShape.push(path);
            }
            // TODO: Consider breaking if polyon is unchanged
          } else {
            dividedShape.push(path);

            // TODO: Consider hiding affected clip polygons, so they don't block
            // MapShaper.closeArcPathways(path, arcs, flags, erasing, true, 0x80);
          }
        }
      }
    });

    // Set pathways of current target shape to hidden/closed in fwd direction
    MapShaper.closeArcPathways(shape, arcs, flags, true, false, true);

    // Re-open clip pathways along divided path, show both directions
    //   (i.e. re-set any pathways in clipping layer that were just consumed)
    // Open forward path (works for -erase too because erase arcs are reversed when merged)
    MapShaper.openArcPathways(dividedShape, arcs, flags, true, false, !!"dissolve", 0x11, 0x80);

    // WRONG: reversing clip/erase order because arc has been reversed in path
    // MapShaper.openArcPathways(clipShapes, arcs, flags, type == 'erase', type == 'clip', !!"dissolve", 0x11, 0x80);

    return dividedShape.length === 0 ? null : dividedShape;
  }

  // Filter a collection of shapes to exclude paths that were modified by clipping
  // and paths that are hidden (e.g. internal boundaries)
  function findUndividedShapes(shapes, flags) {
    return shapes.map(function(shape) {
      var usableParts = [];
      MapShaper.forEachPath(shape, function(ids) {
        var pathIsClean = true,
            pathIsVisible = false;
        for (var i=0; i<ids.length; i++) {
          // check if arc was used in fw or rev direction
          if (!arcIsUnused(ids[i], flags)) {
            pathIsClean = false;
            break;
          }
          if (!pathIsVisible && arcIsVisible(ids[i], flags)) {
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
      MapShaper.openArcPathways(enclosedPaths, arcs, flags, true, false, true);
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
