/* @requires
mapshaper-dataset-utils
mapshaper-path-division
mapshaper-polygon-clipping
mapshaper-polyline-clipping
mapshaper-point-clipping
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
MapShaper.clipLayers = function(targetLayers, src, dataset, type, opts) {
  var clipLyr =  MapShaper.getClipLayer(src, dataset, opts),
      nodes, output;
  MapShaper.requirePolygonLayer(clipLyr, "[" + type + "] Requires a polygon clipping layer");

  // If clipping layer was imported from a second file, it won't be included in
  // dataset
  // (assuming that clipLyr arcs have been merged with dataset.arcs)
  //
  if (Utils.contains(dataset.layers, clipLyr) === false) {
    dataset = {
      layers: [clipLyr].concat(dataset.layers),
      arcs: dataset.arcs
    };
  }

  output = targetLayers.map(function(targetLyr) {
    var clippedShapes, clippedLyr;
    if (targetLyr === clipLyr) {
      stop('[' + type + '] Can\'t clip a layer with itself');
    } else if (MapShaper.layerHasPoints(targetLyr)) {
      // clip point layer
      clippedShapes = MapShaper.clipPoints(targetLyr.shapes, clipLyr.shapes, dataset.arcs, type);
    } else if (MapShaper.layerHasPaths(targetLyr)) {
      // clip polygon or polyline layer
      if (!nodes) nodes = MapShaper.divideArcs(dataset);
      var clip = targetLyr.geometry_type == 'polygon' ? MapShaper.clipPolygons : MapShaper.clipPolylines;
      clippedShapes = clip(targetLyr.shapes, clipLyr.shapes, nodes, type);
    } else {
      // unknown layer type
      stop('[' + type + '] Invalid target layer:', targetLyr.name);
    }

    clippedLyr = Utils.defaults({shapes: clippedShapes, data: null}, targetLyr);
    if (targetLyr.data) {
      clippedLyr.data = opts.no_replace ? targetLyr.data.clone() : targetLyr.data;
    }
    return clippedLyr;
  });
  return output;
};

// @src: a layer object, layer identifier or filename
//
MapShaper.getClipLayer = function(src, dataset, opts) {
  if (utils.isObject(src)) {
    return src;
  }
  var match = MapShaper.findMatchingLayers(dataset.layers, src),
      lyr;
  if (match.length > 1) {
    stop("Clip/erase command received more than one source layer");
  } else if (match.length == 1) {
    lyr = match[0];
  } else {
    // Assuming src is a filename
    // Load clip file without topology; then merge clipping data with target
    //   dataset and build topology.
    opts = utils.extend(opts, {no_topology: true});
    var clipData = api.importFile(src, opts);
    var merged = MapShaper.mergeDatasets([dataset, clipData]);
    api.buildTopology(merged);

    // use arcs from merged dataset, but don't add clip layer to target dataset
    dataset.arcs = merged.arcs;

    // TODO: handle multi-layer sources, e.g. TopoJSON files
    if (clipData.layers.length != 1) {
      stop("Clip/erase only supports clipping with single-layer datasets");
    }
    lyr = clipData.layers[0];
  }
  return lyr || null;
};
