/* @require mapshaper-polygon-intersection, mapshaper-polygon-repair, mapshaper-dissolve2 */

/*
MapShaper.repairPolygonGeometry2 = function(layers, arcs) {
  var nodes = MapShaper.divideArcs(layers, arcs);
  layers.forEach(function(lyr) {
    lyr.shapes = MapShaper.repairPolygons(lyr.shapes, nodes);
  });
  return layers;
};

// assumes that arcs have been divided and rings have been cleaned
//
MapShaper.repairPolygons = function(shapes, nodes) {
  var flags = new Uint8Array(nodes.arcs.size());
  var splitter = MapShaper.getPathSplitter(nodes, flags);
  var dissolver = MapShaper.getRingDissolver(nodes, flags, true);

  return shapes.map(function(shp, i) {
    return MapShaper.dissolvePolygon(shp, splitter, dissolver);
  });

};
*/
