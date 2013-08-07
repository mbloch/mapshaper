/* @requires mapshaper-common, mapshaper-geojson, mapshaper-topojson, mapshaper-shapefile */

MapShaper.guessFileType = function(file) {
  var type = null;
  if (/json$/i.test(file)) {
    type = 'json';
  } else if (/shp$/i.test(file)) {
    type = 'shp';
  }
  return type;
};

// @content: ArrayBuffer or String
// @type: 'shapefile'|'json'
//
MapShaper.importContent = function(content, fileType) {
  var data;
  if (fileType == 'shp') {
    data = MapShaper.importNonTopoDataset(MapShaper.importShp(content));
    data.input_format = 'shapefile';
  } else if (fileType == 'json') {
    var jsonObj = JSON.parse(content);
    if (jsonObj.type == 'Topology') {
      data = MapShaper.importTopoJSON(jsonObj);
      data.input_format = 'topojson';
    } else {
      data = MapShaper.importNonTopoDataset(MapShaper.importGeoJSON(jsonObj));
      data.input_format = 'geojson';
    }
  } else {
    error("Unsupported file type:", fileType);
  }

  MapShaper.validateImportData(data);

  // Calculate data to use for shape preservation
  var numArcs = data.arcs.length;
  var retainedPointCounts = new Uint8Array(numArcs);
  Utils.forEach(data.layers, function(layer) {
    if (layer.geometry_type == 'polygon') {
      var arcCounts = MapShaper.getArcCountsInLayer(layer.shapes, numArcs);
      layer.arcCounts = arcCounts;
      MapShaper.calcPointRetentionData(layer.shapes, retainedPointCounts, arcCounts);
    }
  });

  data.retainedPointCounts = retainedPointCounts;
  return data;
};

MapShaper.validateImportData = function(obj) {
  if (!Utils.isArray(obj.arcs)) error ("Missing topological path data");
  if (!Utils.isArray(obj.layers) || obj.layers.length === 0) error ("Missing layer data");
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


MapShaper.importNonTopoDataset = function(importData) {
  var topoData = MapShaper.buildTopology(importData),
      info = importData.info,
      layer = {
        name: "",
        properties: importData.properties,
        shapes: topoData.shapes,
        geometry_type: info.input_geometry_type
      };

  return {
    arcs: topoData.arcs,
    arcMinPointCounts: topoData.arcMinPointCounts,
    layers: [layer]
  };
};


// Calculate number of interior points to preserve in each arc
// to protect 'primary' rings from collapsing.
//
MapShaper.calcPointRetentionData = function(shapes, retainedPointCounts, arcCounts) {
  Utils.forEach(shapes, function(shape, shapeId) {
    if (!shape) return;
    for (var i=0, n=shape.length; i<n; i++) {
      var arcs = shape[i];
      // if a part has 3 or more arcs, assume it won't collapse...
      // TODO: look into edge cases where this isn't true
      if (arcs.length <= 2) { // && pathData[pathId].isPrimary) {
        MapShaper.calcRetainedCountsForRing(arcs, retainedPointCounts, arcCounts);
      }
    }
  });
  return retainedPointCounts;
};


// Calculate number of interior points in each arc of a topological ring
// that should be preserved in order to prevent ring from collapsing
// @path an array of one or more arc ids making up the ring
// @sharedArcFlags
// @minArcPoints array of counts of interior points to retain, indexed by arc id
// TODO: improve; in some cases, this method could fail to prevent degenerate rings
//
MapShaper.calcRetainedCountsForRing = function(path, retainedPointCounts, arcCounts) {
  var arcId;
  for (var i=0, arcCount=path.length; i<arcCount; i++) {
    arcId = path[i];
    if (arcId < 0) arcId = ~arcId;
    if (arcCount == 1) { // one-arc polygon (e.g. island) -- save two interior points
      retainedPointCounts[arcId] = 2;
    }
    else if (arcCounts[arcId] < 2) {
      retainedPointCounts[arcId] = 1; // non-shared member of two-arc polygon: save one point
    }
  }
};
