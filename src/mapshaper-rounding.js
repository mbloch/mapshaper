/* @require mapshaper-geom, mapshaper-shapes, mapshaper-dissolve2 */

MapShaper.setCoordinatePrecision = function(dataset, precision) {
  var round = geom.getRoundingFunction(precision),
      dissolvePolygon;

  if (dataset.arcs) {
    // need to discard z data if present (it doesn't survive cleaning)
    dataset.arcs.flatten();

    dataset.arcs.forEach2(function(i, n, xx, yy) {
      var j = i + n;
      while (i < j) {
        xx[i] = round(xx[i]);
        yy[i] = round(yy[i]);
        i++;
      }
    });
    var nodes = MapShaper.divideArcs(dataset);
    dissolvePolygon = MapShaper.getPolygonDissolver(nodes);
  }

  dataset.layers.forEach(function(lyr) {
    if (MapShaper.layerHasPoints(lyr)) {
      MapShaper.roundPoints(lyr, round);
    } else if (lyr.geometry_type == 'polygon' && dissolvePolygon) {
      // clean each polygon -- use dissolve function remove spikes
      // TODO implement proper clean/repair function
      lyr.shapes = lyr.shapes.map(dissolvePolygon);
    }
  });
};

MapShaper.roundPoints = function(lyr, round) {
  MapShaper.forEachPoint(lyr, function(p) {
    p[0] = round(p[0]);
    p[1] = round(p[1]);
  });
};
