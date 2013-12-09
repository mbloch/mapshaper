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
  if (layers.length >1) {
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
    Utils.forEach(layers, function(lyr) {
      // Assign "" as name of layers without pre-existing name
      lyr.name = lyr.name || "";
    });

    if (layers.length <= 1) return; // name of single layer guaranteed unique

    // get count for each name
    var counts = Utils.reduce(layers, function(index, lyr) {
      var name = lyr.name;
      index[name] = (name in index) ? index[name] + 1 : 1;
      return index;
    }, {});

    // assign unique name to each layer
    var names = {};
    Utils.forEach(layers, function(lyr) {
      var name = lyr.name,
          count = counts[name],
          i;
      if (count > 1 || name in names) {
        // naming conflict, need to find a unique name
        name = name || 'layer'; // use layer1, layer2, etc as default
        i = 1;
        while ((name + i) in names) {
          i++;
        }
        name = name + i;
      }
      names[name] = true;
      lyr.name = name;
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
