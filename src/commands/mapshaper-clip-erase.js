/* @requires
mapshaper-dataset-utils
mapshaper-path-division
mapshaper-polygon-clipping
mapshaper-polyline-clipping
mapshaper-point-clipping
mapshaper-arc-dissolve
mapshaper-filter-slivers
mapshaper-split
*/

api.clipLayers = function(target, src, dataset, opts) {
  return internal.clipLayers(target, src, dataset, "clip", opts);
};

api.eraseLayers = function(target, src, dataset, opts) {
  return internal.clipLayers(target, src, dataset, "erase", opts);
};

api.clipLayer = function(targetLyr, src, dataset, opts) {
  return api.clipLayers([targetLyr], src, dataset, opts)[0];
};

api.eraseLayer = function(targetLyr, src, dataset, opts) {
  return api.eraseLayers([targetLyr], src, dataset, opts)[0];
};

api.sliceLayers = function(target, src, dataset, opts) {
  return internal.clipLayers(target, src, dataset, "slice", opts);
};

api.sliceLayer = function(targetLyr, src, dataset, opts) {
  return api.sliceLayers([targetLyr], src, dataset, opts);
};

// @clipSrc: layer in @dataset or filename
// @type: 'clip' or 'erase'
internal.clipLayers = function(targetLayers, clipSrc, targetDataset, type, opts) {
  var usingPathClip = utils.some(targetLayers, internal.layerHasPaths);
  var clipDataset, mergedDataset, clipLyr, nodes, tmp, outputLayers;
  opts = opts || {no_cleanup: true}; // TODO: update testing functions
  if (clipSrc && clipSrc.geometry_type) {
    // TODO: update tests to remove this case (clipSrc is a layer)
    clipSrc = {dataset: targetDataset, layer: clipSrc, disposable: true};
  }
  if (opts.bbox) {
    clipDataset = internal.convertClipBounds(opts.bbox);
    clipLyr = clipDataset.layers[0];
  } else if (clipSrc) {
    clipLyr = clipSrc.layer;
    clipDataset = utils.defaults({layers: [clipLyr]}, clipSrc.dataset);
  } else {
    stop("Missing clipping data");
  }
  if (targetDataset.arcs != clipDataset.arcs) {
    // using external dataset -- need to merge arcs
    if (clipSrc && !clipSrc.disposable) {
      // copy layer shapes because arc ids will be reindexed during merging
      clipLyr = clipDataset.layers[0] = internal.copyLayerShapes(clipDataset.layers[0]);
    }
    // merge external dataset with target dataset,
    // so arcs are shared between target layers and clipping lyr
    // Assumes that layers in clipDataset can be modified (if necessary, a copy should be passed in)
    mergedDataset = internal.mergeDatasets([targetDataset, clipDataset]);
    api.buildTopology(mergedDataset); // identify any shared arcs between clipping layer and target dataset
  } else {
    mergedDataset = targetDataset;
  }
  if (usingPathClip) {
    // add vertices at all line intersections
    // (generally slower than actual clipping)
    nodes = internal.addIntersectionCuts(mergedDataset, opts);
    targetDataset.arcs = mergedDataset.arcs;
  } else {
    nodes = new NodeCollection(mergedDataset.arcs);
  }
  outputLayers = internal.clipLayersByLayer(targetLayers, clipLyr, nodes, type, opts);
  if (usingPathClip && !opts.no_cleanup) {
    // Delete unused arcs, merge remaining arcs, remap arcs of retained shapes.
    // This is to remove arcs belonging to the clipping paths from the target
    // dataset, and to heal the cuts that were made where clipping paths
    // crossed target paths
    tmp = {
      arcs: mergedDataset.arcs,
      layers: targetDataset.layers
    };
    internal.replaceLayers(tmp, targetLayers, outputLayers);
    internal.dissolveArcs(tmp);
    targetDataset.arcs = tmp.arcs;
  }
  return outputLayers;
};

internal.clipLayersByLayer = function(targetLayers, clipLyr, nodes, type, opts) {
  internal.requirePolygonLayer(clipLyr, "Requires a polygon clipping layer");
  return targetLayers.reduce(function(memo, targetLyr) {
    if (opts.no_replace) {
      memo.push(targetLyr);
    }
    if (type == 'slice') {
      memo = memo.concat(internal.sliceLayerByLayer(targetLyr, clipLyr, nodes, opts));
    } else {
      memo.push(internal.clipLayerByLayer(targetLyr, clipLyr, nodes, type, opts));
    }
    return memo;
  }, []);
};

internal.getSliceLayerName = function(clipLyr, field, i) {
  var id = field ? clipLyr.data.getRecords()[0][field] : i + 1;
  return 'slice-' + id;
};

internal.sliceLayerByLayer = function(targetLyr, clipLyr, nodes, opts) {
  // may not need no_replace
  var clipLayers = api.splitLayer(clipLyr, opts.id_field, {no_replace: true});
  return clipLayers.map(function(clipLyr, i) {
    var outputLyr = internal.clipLayerByLayer(targetLyr, clipLyr, nodes, 'clip', opts);
    outputLyr.name = internal.getSliceLayerName(clipLyr, opts.id_field, i);
    return outputLyr;
  });
};

internal.clipLayerByLayer = function(targetLyr, clipLyr, nodes, type, opts) {
  var arcs = nodes.arcs;
  var shapeCount = targetLyr.shapes ? targetLyr.shapes.length : 0;
  var nullCount = 0, sliverCount = 0;
  var clippedShapes, outputLyr;
  if (shapeCount === 0) {
    return targetLyr; // ignore empty layer
  }
  if (targetLyr === clipLyr) {
    stop('Can\'t clip a layer with itself');
  }

  if (targetLyr.geometry_type == 'point') {
    clippedShapes = internal.clipPoints(targetLyr.shapes, clipLyr.shapes, arcs, type);
  } else if (targetLyr.geometry_type == 'polygon') {
    clippedShapes = internal.clipPolygons(targetLyr.shapes, clipLyr.shapes, nodes, type);
  } else if (targetLyr.geometry_type == 'polyline') {
    clippedShapes = internal.clipPolylines(targetLyr.shapes, clipLyr.shapes, nodes, type);
  } else {
    stop('Invalid target layer:', targetLyr.name);
  }

  outputLyr = {
    name: targetLyr.name,
    geometry_type: targetLyr.geometry_type,
    shapes: clippedShapes,
    data: targetLyr.data // replaced post-filter
  };

  // Remove sliver polygons
  if (opts.remove_slivers && outputLyr.geometry_type == 'polygon') {
    sliverCount = internal.filterClipSlivers(outputLyr, clipLyr, arcs);
  }

  // Remove null shapes (likely removed by clipping/erasing, although possibly already present)
  api.filterFeatures(outputLyr, arcs, {remove_empty: true, verbose: false});

  // clone data records (to avoid sharing records between layers)
  // TODO: this is not needed when replacing target with a single layer
  if (outputLyr.data) {
    outputLyr.data = outputLyr.data.clone();
  }

  // TODO: redo messages, now that many layers may be clipped
  nullCount = shapeCount - outputLyr.shapes.length;
  if (nullCount && sliverCount) {
    message(internal.getClipMessage(nullCount, sliverCount));
  }
  return outputLyr;
};

internal.getClipMessage = function(nullCount, sliverCount) {
  var nullMsg = nullCount ? utils.format('%,d null feature%s', nullCount, utils.pluralSuffix(nullCount)) : '';
  var sliverMsg = sliverCount ? utils.format('%,d sliver%s', sliverCount, utils.pluralSuffix(sliverCount)) : '';
  if (nullMsg || sliverMsg) {
    return utils.format('Removed %s%s%s', nullMsg, (nullMsg && sliverMsg ? ' and ' : ''), sliverMsg);
  }
  return '';
};

internal.convertClipBounds = function(bb) {
  var x0 = bb[0], y0 = bb[1], x1 = bb[2], y1 = bb[3],
      arc = [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]];

  if (!(y1 > y0 && x1 > x0)) {
    stop("Invalid bbox (should be [xmin, ymin, xmax, ymax]):", bb);
  }
  return {
    arcs: new ArcCollection([arc]),
    layers: [{
      shapes: [[[0]]],
      geometry_type: 'polygon'
    }]
  };
};
