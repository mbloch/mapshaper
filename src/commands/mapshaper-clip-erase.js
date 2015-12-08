/* @requires
mapshaper-dataset-utils
mapshaper-path-division
mapshaper-polygon-clipping
mapshaper-polyline-clipping
mapshaper-point-clipping
mapshaper-arc-dissolve
mapshaper-filter-slivers
*/

api.clipLayers = function(target, src, dataset, opts) {
  return MapShaper.clipLayers(target, src, dataset, "clip", opts);
};

api.eraseLayers = function(target, src, dataset, opts) {
  return MapShaper.clipLayers(target, src, dataset, "erase", opts);
};

api.clipLayer = function(targetLyr, src, dataset, opts) {
  return api.clipLayers([targetLyr], src, dataset, opts)[0];
};

api.eraseLayer = function(targetLyr, src, dataset, opts) {
  return api.eraseLayers([targetLyr], src, dataset, opts)[0];
};

// @target: a single layer or an array of layers
// @type: 'clip' or 'erase'
MapShaper.clipLayers = function(targetLayers, src, srcDataset, type, opts) {
  var clipLyr =  MapShaper.getClipLayer(src, srcDataset, opts),
      usingPathClip = utils.some(targetLayers, MapShaper.layerHasPaths),
      nullCount = 0, sliverCount = 0,
      nodes, outputLayers, dataset;
  opts = opts || {};
  MapShaper.requirePolygonLayer(clipLyr, "[" + type + "] Requires a polygon clipping layer");

  // If clipping layer was imported from a second file, it won't be included in
  // dataset
  // (assuming that clipLyr arcs have been merged with dataset.arcs)
  //
  if (utils.contains(srcDataset.layers, clipLyr) === false) {
    dataset = {
      layers: [clipLyr].concat(srcDataset.layers),
      arcs: srcDataset.arcs
    };
  } else {
    dataset = srcDataset;
  }

  if (usingPathClip) {
    nodes = MapShaper.divideArcs(dataset);
  }

  outputLayers = targetLayers.map(function(targetLyr) {
    var shapeCount = targetLyr.shapes ? targetLyr.shapes.length : 0;
    var clippedShapes, outputLyr;
    if (targetLyr === clipLyr) {
      stop('[' + type + '] Can\'t clip a layer with itself');
    } else if (targetLyr.geometry_type == 'point') {
      clippedShapes = MapShaper.clipPoints(targetLyr.shapes, clipLyr.shapes, dataset.arcs, type);
    } else if (targetLyr.geometry_type == 'polygon') {
      clippedShapes = MapShaper.clipPolygons(targetLyr.shapes, clipLyr.shapes, nodes, type);
    } else if (targetLyr.geometry_type == 'polyline') {
      clippedShapes = MapShaper.clipPolylines(targetLyr.shapes, clipLyr.shapes, nodes, type);
    } else {
      stop('[' + type + '] Invalid target layer:', targetLyr.name);
    }

    outputLyr = MapShaper.getOutputLayer(targetLyr, opts);
    if (opts.no_replace && targetLyr.data) {
      outputLyr.data = targetLyr.data.clone();
    }
    outputLyr.shapes = clippedShapes;

    // Remove sliver polygons
    if (opts.cleanup && outputLyr.geometry_type == 'polygon') {
      sliverCount += MapShaper.filterClipSlivers(outputLyr, clipLyr, dataset.arcs);
    }

    // Remove null shapes (likely removed by clipping/erasing)
    api.filterFeatures(outputLyr, dataset.arcs, {remove_empty: true, verbose: false});
    nullCount += shapeCount - outputLyr.shapes.length;
    return outputLyr;
  });

  // Cleanup is set by option parser; use no-cleanup to disable
  if (usingPathClip && opts.cleanup) {
    // Delete unused arcs, merge remaining arcs, remap arcs of retained shapes.
    // This is to remove arcs belonging to the clipping paths from the target
    // dataset, and to heal the cuts that were made where clipping paths
    // crossed target paths
    dataset = {arcs: srcDataset.arcs, layers: srcDataset.layers};
    if (opts.no_replace) {
      dataset.layers = dataset.layers.concat(outputLayers);
    } else {
      MapShaper.replaceLayers(dataset, targetLayers, outputLayers);
    }
    MapShaper.dissolveArcs(dataset);
  }

  if (nullCount && sliverCount) {
    message(MapShaper.getClipMessage(type, nullCount, sliverCount));
  }

  return outputLayers;
};


MapShaper.getClipMessage = function(type, nullCount, sliverCount) {
  var nullMsg = nullCount ? utils.format('%,d null feature%s', nullCount, utils.pluralSuffix(nullCount)) : '';
  var sliverMsg = sliverCount ? utils.format('%,d sliver%s', sliverCount, utils.pluralSuffix(sliverCount)) : '';
  if (nullMsg || sliverMsg) {
    return utils.format('[%s] Removed %s%s%s', type, nullMsg, (nullMsg && sliverMsg ? ' and ' : ''), sliverMsg);
  }
  return '';
};

// @src: a layer object, layer identifier or filename
MapShaper.getClipLayer = function(src, dataset, opts) {
  var clipLayers, clipDataset, mergedDataset;
  if (utils.isObject(src)) {
    // src is layer object
    return src;
  }
  // check if src is the name of an existing layer
  if (src) {
    clipLayers = MapShaper.findMatchingLayers(dataset.layers, src);
    if (clipLayers.length > 1) {
      stop("[clip/erase] Received more than one source layer");
    } else if (clipLayers.length == 1) {
      return clipLayers[0];
    }
  }
  if (src) {
    // assuming src is a filename
    clipDataset = MapShaper.readClipFile(src, opts);
    if (!clipDataset) {
      stop("Unable to find file [" + src + "]");
    }
    // TODO: handle multi-layer sources, e.g. TopoJSON files
    if (clipDataset.layers.length != 1) {
      stop("Clip/erase only supports clipping with single-layer datasets");
    }
  } else if (opts.bbox) {
    clipDataset = MapShaper.convertClipBounds(opts.bbox);
  } else {
    stop("[clip/erase] Missing clipping data");
  }
  mergedDataset = MapShaper.mergeDatasets([dataset, clipDataset]);
  api.buildTopology(mergedDataset);

  // use arcs from merged dataset, but don't add clip layer to target dataset
  dataset.arcs = mergedDataset.arcs;
  return clipDataset.layers[0];
};

// @src Filename
MapShaper.readClipFile = function(src, opts) {
  // Load clip file without topology; later merge clipping data with target
  //   dataset and build topology.
  opts = utils.extend(opts, {no_topology: true});
  return api.importFile(src, opts);
};

MapShaper.convertClipBounds = function(bb) {
  var x0 = bb[0], y0 = bb[1], x1 = bb[2], y1 = bb[3],
      arc = [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]];

  if (!(y1 > y0 && x1 > x0)) {
    stop("[clip/erase] Invalid bbox (should be [xmin, ymin, xmax, ymax]):", bb);
  }
  return {
    arcs: new ArcCollection([arc]),
    layers: [{
      shapes: [[[0]]],
      geometry_type: 'polygon'
    }]
  };
};
