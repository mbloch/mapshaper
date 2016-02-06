/* @require mapshaper-geom, mapshaper-shapes, mapshaper-dissolve2 */

// Return a copy of a dataset with all coordinates rounded without modifying
// the original dataset
//
MapShaper.setCoordinatePrecision = function(dataset, precision) {
  var round = geom.getRoundingFunction(precision),
      d2 = MapShaper.copyDataset(dataset), // copies arc data
      dissolvePolygon, nodes;

  if (d2.arcs) {
    d2.arcs.applyTransform(null, round);
    nodes = MapShaper.divideArcs(d2);
    dissolvePolygon = MapShaper.getPolygonDissolver(nodes);
  }

  d2.layers.forEach(function(lyr) {
    if (MapShaper.layerHasPoints(lyr)) {
      MapShaper.roundPoints(lyr, round);
    } else if (lyr.geometry_type == 'polygon' && dissolvePolygon) {
      // clean each polygon -- use dissolve function to remove spikes
      // TODO: better handling of corrupted polygons
      lyr.shapes = lyr.shapes.map(dissolvePolygon);
    }
  });
  return d2;
};

MapShaper.roundPoints = function(lyr, round) {
  MapShaper.forEachPoint(lyr, function(p) {
    p[0] = round(p[0]);
    p[1] = round(p[1]);
  });
};
