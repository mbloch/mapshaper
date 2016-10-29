/* @require mapshaper-geom, mapshaper-arcs, mapshaper-dissolve2 */

MapShaper.roundPoints = function(lyr, round) {
  MapShaper.forEachPoint(lyr.shapes, function(p) {
    p[0] = round(p[0]);
    p[1] = round(p[1]);
  });
};

MapShaper.setCoordinatePrecision = function(dataset, precision) {
  var round = geom.getRoundingFunction(precision);
  var dissolvePolygon, nodes;
  MapShaper.transformPoints(dataset, function(x, y) {
    return [round(x), round(y)];
  });
  if (dataset.arcs) {
    nodes = MapShaper.addIntersectionCuts(dataset);
    dissolvePolygon = MapShaper.getPolygonDissolver(nodes);
  }
  dataset.layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polygon' && dissolvePolygon) {
      // clean each polygon -- use dissolve function to remove spikes
      // TODO: better handling of corrupted polygons
      lyr.shapes = lyr.shapes.map(dissolvePolygon);
    }
  });
  return dataset;
};
