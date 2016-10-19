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

// @clipSrc: layer in @dataset or filename
// @type: 'clip' or 'erase'
MapShaper.clipLayers = function(targetLayers, clipSrc, dataset, type, opts) {
  var clipLyr, clipDataset;
  opts = opts || {no_cleanup: true}; // TODO: update testing functions

  // check if clip source is another layer in the same dataset
  clipLyr = MapShaper.findClippingLayer(clipSrc, dataset);
  if (clipLyr) {
    clipDataset = dataset;
  } else {
    if (opts.bbox) {
      // use bbox for clipping
      clipDataset = MapShaper.convertClipBounds(opts.bbox);
    } else {
      // use external file for clipping (assume clipSrc is a filename)
      clipDataset = MapShaper.loadExternalClipLayer(clipSrc, opts);
    }
    if (!clipDataset || clipDataset.layers.length != 1) {
      stop("[clip/erase] Missing clipping data");
    }
    clipLyr = clipDataset.layers[0];
  }
  MapShaper.requirePolygonLayer(clipLyr, "[" + type + "] Requires a polygon clipping layer");
  return MapShaper.clipLayersByLayer(targetLayers, dataset, clipLyr, clipDataset, type, opts);
};

MapShaper.clipLayersByLayer = function(targetLayers, targetDataset, clipLyr, clipDataset, type, opts) {
  var usingPathClip = utils.some(targetLayers, MapShaper.layerHasPaths);
  var usingExternalDataset = targetDataset != clipDataset;
  var nullCount = 0, sliverCount = 0,
      nodes, outputLayers, mergedDataset;

  if (usingExternalDataset) {
    // merge external dataset with target dataset,
    // so arcs are shared between target layers and clipping lyr
    mergedDataset = MapShaper.mergeDatasets([targetDataset, clipDataset]);
    api.buildTopology(mergedDataset); // identify any shared arcs between clipping layer and target dataset
    targetDataset.arcs = mergedDataset.arcs; // replace arcs in original dataset with merged arcs
  } else {
    mergedDataset = targetDataset;
  }

  if (usingPathClip) {
    // add vertices at all line intersections
    nodes = MapShaper.divideArcs(mergedDataset);
  }

  outputLayers = targetLayers.map(function(targetLyr) {
    var shapeCount = targetLyr.shapes ? targetLyr.shapes.length : 0;
    var clippedShapes, outputLyr;
    if (shapeCount === 0) {
      return targetLyr; // ignore empty layer
    }
    if (targetLyr === clipLyr) {
      stop('[' + type + '] Can\'t clip a layer with itself');
    } else if (targetLyr.geometry_type == 'point') {
      clippedShapes = MapShaper.clipPoints(targetLyr.shapes, clipLyr.shapes, mergedDataset.arcs, type);
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
    if (opts.remove_slivers && outputLyr.geometry_type == 'polygon') {
      sliverCount += MapShaper.filterClipSlivers(outputLyr, clipLyr, targetDataset.arcs);
    }

    // Remove null shapes (likely removed by clipping/erasing, although possibly already present)
    api.filterFeatures(outputLyr, targetDataset.arcs, {remove_empty: true, verbose: false});
    nullCount += shapeCount - outputLyr.shapes.length;
    return outputLyr;
  });

  // integrate output layers into target dataset
  // (doing this here instead of in runCommand() to allow arc cleaning)
  if (opts.no_replace) {
    targetDataset.layers = targetDataset.layers.concat(outputLayers);
  } else {
    MapShaper.replaceLayers(targetDataset, targetLayers, outputLayers);
  }

  if (usingPathClip && !opts.no_cleanup) {
    // Delete unused arcs, merge remaining arcs, remap arcs of retained shapes.
    // This is to remove arcs belonging to the clipping paths from the target
    // dataset, and to heal the cuts that were made where clipping paths
    // crossed target paths
    MapShaper.dissolveArcs(targetDataset);
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

// see if @clipSrc is a layer in @dataset
MapShaper.findClippingLayer = function(clipSrc, dataset) {
  var layers, lyr;
  if (utils.isObject(clipSrc) && utils.contains(dataset.layers, clipSrc)) {
    lyr = clipSrc;
  } else if (utils.isString(clipSrc)) {
    // see if clipSrc is a layer name
    layers = MapShaper.findMatchingLayers(dataset.layers, clipSrc);
    if (layers.length > 1) {
      stop("[clip/erase] Received more than one source layer");
    } else if (layers.length == 1) {
      lyr = layers[0];
    }
  }
  return lyr || null;
};

// try to load a clipping layer from a file
MapShaper.loadExternalClipLayer = function(path, opts) {
  // Load clip file without topology (topology is built later, together with target dataset)
  var dataset = api.importFile(path, utils.defaults({no_topology: true}, opts));
  if (!dataset) {
    stop("Unable to find file [" + path + "]");
  }
  if (dataset.layers.length != 1) {
    // TODO: handle multi-layer sources, e.g. TopoJSON files
    stop("Clip/erase only supports clipping with single-layer datasets");
  }
  return dataset;
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
