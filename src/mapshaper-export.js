/* @requires
mapshaper-geojson
mapshaper-topojson
mapshaper-shapefile
mapshaper-dataset-utils
*/

// Return an array of objects with "filename" "filebase" "extension" and
// "content" attributes.
//
MapShaper.exportFileContent = function(dataset, opts) {
  var layers = dataset.layers;

  if (!opts.format) error("[o] Missing output format");

  var files = [],
      exporter = MapShaper.exporters[opts.format];
  if (!exporter) {
    error("[o] Unknown export format:", opts.format);
  }

  MapShaper.validateLayerData(layers);
  MapShaper.assignUniqueLayerNames(layers);

  if (opts.cut_table) {
    files = MapShaper.exportDataTables(layers, opts).concat(files);
  }

  files = exporter(dataset, opts).concat(files);

  // If rounding or quantization are applied during export, bounds may
  // change somewhat... consider adding a bounds property to each layer during
  // export when appropriate.
  if (opts.bbox_index) {
    files.push(MapShaper.createIndexFile(dataset));
  }

  MapShaper.validateFileNames(files);
  return files;
};

MapShaper.exporters = {
  geojson: MapShaper.exportGeoJSON,
  topojson: MapShaper.exportTopoJSON,
  shapefile: MapShaper.exportShapefile
};

// Generate json file with bounding boxes and names of each export layer
// TODO: consider making this a command, or at least make format settable
//
MapShaper.createIndexFile = function(dataset) {
  var index = Utils.map(dataset.layers, function(lyr) {
    var bounds = MapShaper.getLayerBounds(lyr, dataset.arcs);
    return {
      bbox: bounds.toArray(),
      name: lyr.name
    };
  });

  return {
    content: JSON.stringify(index),
    filename: "bbox-index.json"
  };
};

MapShaper.validateLayerData = function(layers) {
  Utils.forEach(layers, function(lyr) {
    if (!Utils.isArray(lyr.shapes)) {
      error ("[validateLayerData()] A layer is missing shape data");
    }
    // allowing null-type layers
    if (lyr.geometry_type === null) {
      if (Utils.some(lyr.shapes, function(o) {
        return !!o;
      })) {
        error("[validateLayerData()] A layer contains shape records and a null geometry type");
      }
    } else if (!Utils.contains(['polygon', 'polyline', 'point'], lyr.geometry_type)) {
      error ("[validateLayerData()] A layer has an invalid geometry type:", lyr.geometry_type);
    }
  });
};

MapShaper.validateFileNames = function(files) {
  var index = {};
  files.forEach(function(file, i) {
    var filename = file.filename;
    if (!filename) error("[o] Missing a filename for file" + i);
    if (filename in index) error("[o] Duplicate filename", filename);
    index[filename] = true;
  });
};

MapShaper.assignUniqueLayerNames = function(layers) {
  var names = layers.map(function(lyr) {
    return lyr.name || "layer";
  });
  var uniqueNames = MapShaper.uniqifyNames(names);
  layers.forEach(function(lyr, i) {
    lyr.name = uniqueNames[i];
  });
};

MapShaper.getDefaultFileExtension = function(fileType) {
  var ext = "";
  if (fileType == 'shapefile') {
    ext = 'shp';
  } else if (fileType == 'geojson' || fileType == 'topojson') {
    ext = "json";
  }
  return ext;
};

MapShaper.exportDataTables = function(layers, opts) {
  var tables = [];
  layers.forEach(function(lyr) {
    if (lyr.data) {
      tables.push({
        content: lyr.data.exportAsJSON(), // TODO: other formats
        filename: (lyr.name ? lyr.name + '-' : '') + 'table.json'
      });
    }
  });
  return tables;
};

MapShaper.uniqifyNames = function(names) {
  var counts = Utils.getValueCounts(names),
      index = {};
  return names.map(function(name) {
    var count = counts[name],
        i = 1;
    if (count > 1 || name in index) {
      while ((name + i) in index) {
        i++;
      }
      name = name + i;
    }
    index[name] = true;
    return name;
  });
};
