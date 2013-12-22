/* @requires mapshaper-common */

MapShaper.convertLayersToInnerLines = function(layers, arcs) {
  return Utils.map(layers, function(lyr) {
    return MapShaper.convertLayerToInnerLines(lyr, arcs);
  });
};

MapShaper.convertLayerToInnerLines = function(lyr, arcs) {
  if (lyr.geometry_type != 'polygon') {
    stop("[innerlines] Layer not polygon type");
  }

  var arcCount = arcs.size(),
      counts = MapShaper.countArcsInShapes(lyr.shapes, arcCount),
      shapes = [];

  for (var i=0; i<arcCount; i++) {
    if (counts[i] > 1) {
      shapes.push([[i]]);
    }
  }

  var innerLyr = {
    geometry_type: 'polyline',
    name: lyr.name,
    shapes: shapes
  };

  return innerLyr;
};

MapShaper.countArcsInShapes = function(shapes, arcCount) {
  var counts = new Uint8Array(arcCount);
  MapShaper.traverseShapes(shapes, null, function(obj) {
    var arcs = obj.arcs,
        id;
    for (var i=0; i<arcs.length; i++) {
      id = arcs[i];
      if (id < 0) id = ~id;
      counts[id]++;
    }
  });
  return counts;
};
