/* @requires
mapshaper-geojson
mapshaper-topojson
mapshaper-shapefile
mapshaper-svg
mapshaper-dataset-utils
mapshaper-rounding
mapshaper-delim-export
mapshaper-json-table
dbf-export
*/

// Return an array of objects with "filename" "filebase" "extension" and
// "content" attributes.
//
MapShaper.exportFileContent = function(dataset, opts) {
  var outFmt = opts.format = MapShaper.getOutputFormat(dataset, opts),
      exporter = MapShaper.exporters[outFmt],
      files = [];

  if (!outFmt) {
    error("[o] Missing output format");
  } else if (!exporter) {
    error("[o] Unknown output format:", outFmt);
  }

  // shallow-copy dataset and layers, so layers can be renamed for export
  dataset = utils.defaults({
    layers: dataset.layers.map(function(lyr) {return utils.extend({}, lyr);})
  }, dataset);

  if (opts.output_file && outFmt != 'topojson') {
    dataset.layers.forEach(function(lyr) {
      lyr.name = utils.getFileBase(opts.output_file);
    });
  }

  if (opts.precision && outFmt != 'svg') {
    dataset = MapShaper.copyDatasetForExport(dataset);
    MapShaper.setCoordinatePrecision(dataset, opts.precision);
  }

  MapShaper.validateLayerData(dataset.layers);
  MapShaper.assignUniqueLayerNames(dataset.layers);

  if (opts.cut_table) {
    files = MapShaper.exportDataTables(dataset.layers, opts).concat(files);
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
  json: MapShaper.exportJSON,
  svg: MapShaper.exportSVG
};

MapShaper.getOutputFormat = function(dataset, opts) {
  var outFile = opts.output_file || null,
      inFmt = dataset.info && dataset.info.input_formats && dataset.info.input_formats[0],
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

// Assign unique layer names across multiple datasets
MapShaper.assignUniqueLayerNames2 = function(datasets) {
  var layers = datasets.reduce(function(memo, dataset) {
    return memo.concat(dataset.layers);
  }, []);
  MapShaper.assignUniqueLayerNames(layers);
};

MapShaper.assignUniqueFileNames = function(output) {
  var names = output.map(function(o) {return o.filename;});
  var uniqnames = MapShaper.uniqifyNames(names, MapShaper.formatVersionedFileName);
  output.forEach(function(o, i) {o.filename = uniqnames[i];});
};

// TODO: remove this -- format=json creates the same output
//   (but need to make sure there's a way to prevent names of json data files
//    from colliding with names of GeoJSON or TopoJSON files)
MapShaper.exportDataTables = function(layers, opts) {
  var tables = [];
  layers.forEach(function(lyr) {
    if (lyr.data) {
      tables.push({
        content: JSON.stringify(lyr.data),
        filename: (lyr.name ? lyr.name + '-' : '') + 'table.json'
      });
    }
  });
  return tables;
};

MapShaper.formatVersionedName = function(name, i) {
  var suffix = String(i);
  if (/[0-9]$/.test(name)) {
    suffix = '-' + suffix;
  }
  return name + suffix;
};

MapShaper.formatVersionedFileName = function(filename, i) {
  var parts = filename.split('.');
  var ext, base;
  if (parts.length < 2) {
    return MapShaper.formatVersionedName(filename, i);
  }
  ext = parts.pop();
  base = parts.join('.');
  return MapShaper.formatVersionedName(base, i) + '.' + ext;
};

MapShaper.uniqifyNames = function(names, formatter) {
  var counts = utils.countValues(names),
      format = formatter || MapShaper.formatVersionedName,
      blacklist = {};

  Object.keys(counts).forEach(function(name) {
    if (counts[name] > 1) blacklist[name] = true; // uniqify all instances of a name
  });
  return names.map(function(name) {
    var i = 1, // first version id
        candidate = name,
        versionedName;
    while (candidate in blacklist) {
      versionedName = format(name, i);
      if (!versionedName || versionedName == candidate) {
        throw new Error("Naming error"); // catch buggy versioning function
      }
      candidate = versionedName;
      i++;
    }
    blacklist[candidate] = true;
    return candidate;
  });
};
