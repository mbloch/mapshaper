/* @requires
mapshaper-geojson
mapshaper-topojson
mapshaper-shapefile
mapshaper-dataset-utils
mapshaper-rounding
mapshaper-delim-export
mapshaper-dbf-table
mapshaper-json-table
*/

// Return an array of objects with "filename" "filebase" "extension" and
// "content" attributes.
//
MapShaper.exportFileContent = function(dataset, opts) {
  var outFmt = opts.format = MapShaper.getOutputFormat(dataset, opts),
      exporter = MapShaper.exporters[outFmt],
      layers = dataset.layers,
      files = [];

  if (!outFmt) {
    error("[o] Missing output format");
  } else if (!exporter) {
    error("[o] Unknown export format:", outFmt);
  }

  if (opts.output_file && outFmt != 'topojson') {
    layers.forEach(function(lyr) {
      lyr.name = utils.getFileBase(opts.output_file);
    });
  }

  if (opts.precision) {
    dataset = MapShaper.setCoordinatePrecision(dataset, opts.precision);
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
  shapefile: MapShaper.exportShapefile,
  dsv: MapShaper.exportDelim,
  dbf: MapShaper.exportDbf,
  json: MapShaper.exportJSON
};

MapShaper.getOutputFormat = function(dataset, opts) {
  var outFile = opts.output_file || null,
      inFmt = dataset.info && dataset.info.input_format,
      outFmt = null;

  if (opts.format) {
    outFmt = opts.format;
  } else if (outFile) {
    outFmt = MapShaper.inferOutputFormat(outFile, inFmt);
  } else if (inFmt) {
    outFmt = inFmt;
  }
  return outFmt;
};

// Generate json file with bounding boxes and names of each export layer
// TODO: consider making this a command, or at least make format settable
//
MapShaper.createIndexFile = function(dataset) {
  var index = dataset.layers.map(function(lyr) {
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
  layers.forEach(function(lyr) {
    if (!lyr.geometry_type) {
      // allowing data-only layers
      if (lyr.shapes && utils.some(lyr.shapes, function(o) {
        return !!o;
      })) {
        error("[export] A layer contains shape records and a null geometry type");
      }
    } else {
      if (!utils.contains(['polygon', 'polyline', 'point'], lyr.geometry_type)) {
        error ("[export] A layer has an invalid geometry type:", lyr.geometry_type);
      }
      if (!lyr.shapes) {
        error ("[export] A layer is missing shape data");
      }
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

/*
MapShaper.getDefaultFileExtension = function(fileType) {
  var ext = "";
  if (fileType == 'shapefile') {
    ext = 'shp';
  } else if (fileType == 'geojson' || fileType == 'topojson') {
    ext = "json";
  }
  return ext;
};
*/

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

  var counts = utils.countValues(names),
      index = {},
      suffix;
  return names.map(function(name) {
    var count = counts[name],
        i = 1;
    if (count > 1 || name in index) {
      do {
        suffix = String(i);
        if (/[0-9]$/.test(name)) {
          suffix = '-' + suffix;
        }
        i++;
      } while ((name + suffix) in index);
      name = name + suffix;
    }
    index[name] = true;
    return name;
  });
};
