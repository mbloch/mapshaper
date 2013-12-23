/* @requires mapshaper-common */

MapShaper.convertLayersToInnerLines = function(layers, arcs) {
  T.start();
  var converted = Utils.map(layers, function(lyr) {
    return MapShaper.convertLayerToInnerLines(lyr, arcs);
  });
  T.stop("Inner lines");
  return converted;
};

MapShaper.convertLayerToInnerLines = function(lyr, arcs) {
  if (lyr.geometry_type != 'polygon') {
    stop("[innerlines] Layer not polygon type");
  }
  var arcs2 = MapShaper.convertShapesToArcs(lyr.shapes, arcs.size(), 'inner'),
      lyr2 = MapShaper.convertArcsToLineLayer(arcs2);
  lyr2.name = lyr.name;
  return lyr2;
};

MapShaper.convertLayersToTypedLines = function(layers, arcs, fields) {
  T.start();
  var converted = Utils.map(layers, function(lyr) {
    return MapShaper.convertLayerToTypedLines(lyr, arcs, fields);
  });
  T.stop("Lines");
  return converted;
};

MapShaper.convertLayerToTypedLines = function(lyr, arcs, fields) {
  if (lyr.geometry_type != 'polygon') {
    stop("[lines] Layer not polygon type");
  }
  var arcCount = arcs.size(),
      outerArcs = MapShaper.convertShapesToArcs(lyr.shapes, arcCount, 'outer'),
      typeCode = 0,
      allArcs = [],
      allData = [];

  function addArcs(typeArcs) {
    var typeData = Utils.repeat(typeArcs.length, function(i) {
          return {TYPE: typeCode};
        }) || [];
    allArcs = Utils.merge(typeArcs, allArcs);
    allData = Utils.merge(typeData, allData);
    typeCode++;
  }

  addArcs(outerArcs);

  if (Utils.isArray(fields)) {
    if (!lyr.data) {
      stop("[lines] missing a data table:");
    }
    Utils.forEach(fields, function(field) {
      if (!lyr.data.fieldExists(field)) {
        stop("[lines] unknown data field:", field);
      }
      var dissolved = MapShaper.dissolve(lyr, arcs, field),
          dissolvedArcs = MapShaper.convertShapesToArcs(dissolved.shapes, arcCount, 'inner');
      dissolvedArcs = Utils.difference(dissolvedArcs, allArcs);
      addArcs(dissolvedArcs);
    });
  }

  var innerArcs = MapShaper.convertShapesToArcs(lyr.shapes, arcCount, 'inner');
  innerArcs = Utils.difference(innerArcs, allArcs);
  addArcs(innerArcs);

  var lyr2 = MapShaper.convertArcsToLineLayer(allArcs, allData);
  lyr2.name = lyr.name;
  return lyr2;
};

MapShaper.convertArcsToLineLayer = function(arcs, data) {
  var shapes = MapShaper.convertArcsToShapes(arcs),
      lyr = {
        geometry_type: 'polyline',
        shapes: shapes
      };
  if (data) {
    lyr.data = new DataTable(data);
  }
  return lyr;
};

MapShaper.convertArcsToShapes = function(arcs) {
  return Utils.map(arcs, function(id) {
    return [[id]];
  });
};

MapShaper.convertShapesToArcs = function(shapes, arcCount, type) {
  type = type || 'all';
  var counts = MapShaper.countArcsInShapes(shapes, arcCount),
      arcs = [],
      count;

  for (var i=0, n=counts.length; i<n; i++) {
    count = counts[i];
    if (count > 0) {
      if (type == 'all' || type == 'outer' && count == 1 ||
          type == 'inner' && count > 1) {
        arcs.push(i);
      }
    }
  }
  return arcs;
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
