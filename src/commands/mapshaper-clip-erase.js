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
  var nodes = MapShaper.divideArcs(dataset);
  var output = targetLayers.map(function(targetLyr) {
    return MapShaper.clipLayer(targetLyr, clipLyr, nodes, type, opts);
  });
  return output;
};

// Use a polygon layer to clip or erase a target layer
// Assumes segment intersections have been removed by division
// @type 'clip' | 'erase'
MapShaper.clipLayer = function(targetLyr, clipLyr, nodes, type, opts) {
  var functions = {
    polygon: MapShaper.clipPolygons,
    polyline: MapShaper.clipPolylines,
    point: MapShaper.clipPoints
  };
  var clip = functions[targetLyr.geometry_type],
      clippedShapes, clippedLyr;
  if (!clip) {
    stop('[' + type + '] Invalid layer type:', targetLyr.geometry_type);
  }
  clippedShapes = clip(targetLyr.shapes, clipLyr.shapes, nodes, type, opts);
  clippedLyr = Utils.defaults({shapes: clippedShapes, data: null}, targetLyr);
  if (targetLyr.data) {
    clippedLyr.data = opts.no_replace ? targetLyr.data.clone() : targetLyr.data;
  }
  return clippedLyr;
};
