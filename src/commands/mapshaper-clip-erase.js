/* @requires
mapshaper-dataset-utils
mapshaper-path-division
mapshaper-polygon-clipping
mapshaper-polyline-clipping
mapshaper-point-clipping
*/

api.clipLayers = function(target, clipLyr, dataset, opts) {
  return MapShaper.clipLayers(target, clipLyr, dataset, "clip", opts);
};

api.eraseLayers = function(target, clipLyr, dataset, opts) {
  return MapShaper.clipLayers(target, clipLyr, dataset, "erase", opts);
};

api.clipLayer = function(targetLyr, clipLyr, dataset, opts) {
  return api.clipLayers([targetLyr], clipLyr, dataset, opts)[0];
};

api.eraseLayer = function(targetLyr, clipLyr, dataset, opts) {
  return api.eraseLayers([targetLyr], clipLyr, dataset, opts)[0];
};

// @target: a single layer or an array of layers
// @type: 'clip' or 'erase'
MapShaper.clipLayers = function(targetLayers, clipLyr, dataset, type, opts) {
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

  var nodes;
  var output = targetLayers.map(function(targetLyr) {
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
