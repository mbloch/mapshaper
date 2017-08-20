/* @requires mapshaper-dissolve2, mapshaper-polygon-mosaic */

api.polygons = function(layers, dataset, opts) {
  layers.forEach(internal.requirePolylineLayer);
  internal.addIntersectionCuts(dataset, opts);
  return layers.map(function(lyr) {
    if (lyr.geometry_type != 'polyline') stop("Expected a polyline layer");
    return internal.createPolygonLayer(lyr, dataset, opts);
  });
};

internal.createPolygonLayer = function(lyr, dataset, opts) {
  var arcCounts = new Uint8Array(dataset.arcs.size());
  var arcFilter = function(absId) {return arcCounts[absId] > 0;};
  var data, nodes;
  internal.countArcsInShapes(lyr.shapes, arcCounts);
  // console.log(arcCounts)
  nodes = new NodeCollection(dataset.arcs, arcFilter);
  nodes.detachAcyclicArcs();
  data = internal.buildPolygonMosaic(nodes);
  return {
    geometry_type: 'polygon',
    name: lyr.name,
    shapes: data.mosaic
  };
};
