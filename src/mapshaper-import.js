/* @requires mapshaper-common, mapshaper-geojson, mapshaper-topojson, mapshaper-shapefile */

// @content: ArrayBuffer or String
// @type: 'shapefile'|'json'
//
MapShaper.importContent = function(content, fileType, opts) {
  var data,
      fileFmt;
  if (fileType == 'shp') {
    data = MapShaper.importShp(content, opts);
    fileFmt = 'shapefile';
  } else if (fileType == 'json') {
    var jsonObj = JSON.parse(content);
    if (jsonObj.type == 'Topology') {
      data = MapShaper.importTopoJSON(jsonObj, opts);
      fileFmt = 'topojson';
    } else {
      data = MapShaper.importGeoJSON(jsonObj, opts);
      fileFmt = 'geojson';
    }
  } else {
    error("Unsupported file type:", fileType);
  }

  // Calc arc counts, for identifying shared boundaries, etc.
  // Consider: Tabulate arc counts later, if/when needed.
  var numArcs = data.arcs.size();
  Utils.forEach(data.layers, function(layer) {
    if (layer.geometry_type == 'polygon') {
      var arcCounts = MapShaper.getArcCountsInLayer(layer.shapes, numArcs);
      layer.arcCounts = arcCounts;
    }
  });

  data.info = {
    input_format: fileFmt
  };
  return data;
};


MapShaper.getArcCountsInLayer = function(shapes, numArcs) {
  var counts = new Uint8Array(numArcs);
  Utils.forEach(shapes, function(shape) {
    if (shape) MapShaper.calcArcCountsInShape(counts, shape);
  });
  return counts;
};

MapShaper.calcArcCountsInShape = function(counts, shape) {
  var arcId, arcs;
  for (var j=0, pathCount = shape.length; j<pathCount; j++) {
    arcs = shape[j];
    for (var i=0, n=arcs.length; i<n; i++) {
      arcId = arcs[i];
      if (arcId < 0) arcId = ~arcId;
      counts[arcId] += 1;
    }
  }
};
