/* @requires
mapshaper-dataset-utils
mapshaper-overlay-utils
mapshaper-intersection-cuts
mapshaper-polygon-clipping
mapshaper-polyline-clipping
mapshaper-point-clipping
mapshaper-arc-dissolve
mapshaper-filter-slivers
mapshaper-split
mapshaper-bbox2-clipping
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
  var mergedDataset, clipLyr, nodes;
  opts = opts || {no_cleanup: true}; // TODO: update testing functions
  if (opts.bbox2 && usingPathClip) { // assumes target dataset has arcs
    return internal.clipLayersByBBox(targetLayers, targetDataset, opts);
  }
  mergedDataset = internal.mergeLayersForOverlay(targetLayers, targetDataset, clipSrc, opts);
  if (usingPathClip) {
    // add vertices at all line intersections
    // (generally slower than actual clipping)
    nodes = internal.addIntersectionCuts(mergedDataset, opts);
    targetDataset.arcs = mergedDataset.arcs;
  } else {
    nodes = new NodeCollection(mergedDataset.arcs);
  }
  clipLyr = mergedDataset.layers.pop();
  return internal.clipLayersByLayer(targetLayers, clipLyr, nodes, type, opts);
};


internal.clipLayersByLayer = function(targetLayers, clipLyr, nodes, type, opts) {
  internal.requirePolygonLayer(clipLyr, "Requires a polygon clipping layer");
  return targetLayers.reduce(function(memo, targetLyr) {
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

  // TODO: optimize some of these functions for bbox clipping
  if (targetLyr.geometry_type == 'point') {
    clippedShapes = internal.clipPoints(targetLyr.shapes, clipLyr.shapes, arcs, type);
  } else if (targetLyr.geometry_type == 'polygon') {
    clippedShapes = internal.clipPolygons(targetLyr.shapes, clipLyr.shapes, nodes, type, opts);
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
