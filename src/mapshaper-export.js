/* @requires
mapshaper-geojson
mapshaper-topojson
mapshaper-shapefile
mapshaper-dataset-utils
*/

// Return an array of objects with "filename" "filebase" "extension" and
// "content" attributes.
//
api.exportFileContent =
MapShaper.exportFileContent = function(layers, arcData, opts) {
  var exporter = MapShaper.exporters[opts.output_format],
      files = [];
  if (!exporter) {
    error("exportFileContent() Unknown export format:", opts.output_format);
  }
  if (!opts.output_extension) {
    opts.output_extension = MapShaper.getDefaultFileExtension(opts.output_format);
  }
  if (!opts.output_file_base) {
    opts.output_file_base = "out";
  }

  T.start();
  validateLayerData(layers);
  assignLayerNames(layers);
  if (opts.cut_table) {
    Utils.merge(files, MapShaper.exportDataTables(layers, opts));
  }

  files = Utils.merge(exporter(layers, arcData, opts), files);
  // output index of bounding boxes when multiple layers are being exported
  // TODO: only do this when it makes sense, e.g. layers are the result of splitting
  // Also: if rounding or quantization are applied during export, bounds may
  // change somewhat... consider adding a bounds property to each layer during
  // export when appropriate.
  if (layers.length > 1) {
    files.push(createIndexFile(layers, arcData));
  }

  assignFileNames(files, opts);
  T.stop("Export " + opts.output_format);
  return files;

  function validateLayerData(layers) {
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
  }

  // Make sure each layer has a unique name
  function assignLayerNames(layers, opts) {
    var names = layers.map(function(lyr) {
      return lyr.name || "";
    });
    var uniqueNames = MapShaper.getUniqueLayerNames(names);
    layers.forEach(function(lyr, i) {
      lyr.name = uniqueNames[i];
    });
  }

  function assignFileNames(files, opts) {
    var index = {};
    Utils.forEach(files, function(file) {
      file.extension = file.extension || opts.output_extension;
      var basename = opts.output_file_base,
          filename;
      if (file.name) {
        basename += "-" + file.name;
      }
      filename = basename + "." + file.extension;
      if (filename in index) error("File name conflict:", filename);
      index[filename] = true;
      file.filebase = basename;
      file.filename = filename;
    });
  }

  // Generate json file with bounding boxes and names of each export layer
  //
  function createIndexFile(layers, arcs) {
    var index = Utils.map(layers, function(lyr) {
      var bounds = MapShaper.getLayerBounds(lyr, arcs);
      return {
        bounds: bounds.toArray(),
        name: lyr.name
      };
    });

    return {
      content: JSON.stringify(index),
      extension: 'json',
      name: 'index'
    };
  }
};

MapShaper.exporters = {
  geojson: MapShaper.exportGeoJSON,
  topojson: MapShaper.exportTopoJSON,
  shapefile: MapShaper.exportShapefile
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
      var name = (lyr.name ? lyr.name + '-' : '') + 'table';
      tables.push({
        content: lyr.data.exportAsJSON(), // TODO: other formats
        name: name,
        extension: "json"
      });
    }
  });
  return tables;
};
