/* @requires
mapshaper-path-export
mapshaper-layer-math
*/

// Return an array of objects with "filename" "filebase" "extension" and
// "content" attributes.
//
MapShaper.exportContent = function(layers, arcData, opts) {
  var exporter = MapShaper.exporters[opts.output_format],
      files;
  if (!exporter) {
    error("exportContent() Unknown export format:", opts.output_format);
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
  files = exporter(layers, arcData, opts);
  if (opts.cut_table) {
    Utils.merge(files, MapShaper.exportDataTables(layers, opts));
  }
  if (layers.length > 1) {
    files.push(createIndexFile(layers, arcData));
  }
  assignFileNames(files, opts);
  T.stop("Export " + opts.output_format);
  return files;

  function validateLayerData(layers) {
    Utils.forEach(layers, function(lyr) {
      if (!Utils.isArray(lyr.shapes)) {
        error ("#exportContent() A layer is missing shape data");
      }
      if (lyr.geometry_type != 'polygon' && lyr.geometry_type != 'polyline') {
        error ("#exportContent() A layer is missing a valid geometry type");
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
      var bounds = MapShaper.calcLayerBounds(lyr, arcs);
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
  shapefile: MapShaper.exportShp
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
