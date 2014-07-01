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

  // DON'T DISSOLVE -- current dissolve function may fail if clip shapes have topology problems
  // var clipShapes = MapShaper.dissolveShapes(clipLyr.shapes, arcs);
  var clipShapes = clipLyr.shapes;

  var flags = MapShaper.initClippingFlags(clipShapes, arcs, type);

  //console.log('### target shapes:', targetLyr.shapes)
  //console.log('### clip shapes:', clipShapes);

  var dividePath = MapShaper.getPathSplitter(arcs, flags);
  var dividedShapes = clipPolygons(targetLyr.shapes, clipShapes, arcs, type);

  var dividedLyr = Utils.defaults({shapes: dividedShapes, data: null}, targetLyr);

  if (targetLyr.data) {
    dividedLyr.data = opts.no_replace ? targetLyr.data.clone() : targetLyr.data;
  }
  return dividedLyr;

  function clipPolygons(targetShapes, clipShapes, arcs, type) {
    var index = new PathIndex(clipShapes, arcs);
    var clippedShapes = targetShapes.map(function(shape) {
      var clipped = null;
      if (shape) {
        MapShaper.openArcPathways(shape, arcs, flags, true, false, false);
        clipped = clipPolygon(shape, type, index);
      }
      return clipped;
    });

    // add clip/erase polygons that are fully contained in a target polygon
    // need to index only non-intersecting clip shapes
    // (Intersecting shapes have one or more arcs that have been scanned)
    var undividedClipShapes = findUndividedShapes(clipShapes, flags);
    index = new PathIndex(undividedClipShapes, arcs);
    targetShapes.forEach(function(shape, shapeId) {
      var paths = findInteriorPaths(shape, type, index);
      if (paths) {
        clippedShapes[shapeId] = (clippedShapes[shapeId] || []).concat(paths);
      }
    });

    return clippedShapes;
  }



  // Filter a collection of shapes to exclude paths that were modified by clipping
  // TODO: change this to exclude shapes that touch nodes that are shared
  function findUndividedShapes(shapes, flags) {
    return shapes.map(function(shape) {
      var parts = [];
      MapShaper.forEachPath(shape, function(ids) {
        var undivided = true, id, abs;
        for (var i=0; i<ids.length; i++) {
          id = ids[i];
          abs = (id < 0) ? ~id : id;

          if ((flags[abs] & 0x44) > 0) { // arc was used in fw or rev direction
            undivided = false;
            break;
          }
        }
        if (undivided) parts.push(ids);
      });
      return parts.length > 0 ? parts : null;
    });
  }

  // search for indexed clipping paths contained in a shape
  function findInteriorPaths(shape, type, index) {
    var enclosedPaths = index.findPathsInsideShape(shape);
    if (!enclosedPaths) return null;
    var paths = [];
    enclosedPaths.forEach(function(ids) {
      var path;
      if (type == 'erase') {
        ids = ids.concat();
        MapShaper.reversePath(ids);
      }
      for (var j=0; j<ids.length; j++) {
        path = dividePath(ids[j]);
        if (path) {
          paths.push(path);
        }
      }
    });
    return paths.length > 0 ? paths : null;
  }

  function clipPolygon(shape, type, index) {
    var dividedShape = [],
        clipping = type == 'clip',
        erasing = type == 'erase';

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
            // consider: breaking if polyon is unchanged
          } else {
            dividedShape.push(path);
          }
        }
      }
    });
    return dividedShape.length === 0 ? null : dividedShape;
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

MapShaper.initClippingFlags = function(clipShapes, arcs, type) {
  var flags = new Uint8Array(arcs.size());
  MapShaper.openArcPathways(clipShapes, arcs, flags, type == 'clip', type == 'erase', !!"dissolve", !!"priority");
  return flags;
};
