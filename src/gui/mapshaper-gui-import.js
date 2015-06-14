/* @requires mapshaper-gui-lib, mapshaper-import */

gui.getImportDataset = (function() {
  var fileIndex = {}; //
  return function(basename) {
    var dataset = fileIndex[basename];
    if (!dataset) {
      dataset = fileIndex[basename] = {
        info: {}
      };
    }
    return dataset;
  };
}());

gui.mergeImportDataset = function(dest, src) {
  if (!dest.layers) {
    dest.layers = src.layers;
  } else if (dest.layers.length == 1 && src.layers.length == 1) {
    utils.extend(dest.layers[0], src.layers[0]);
    // TODO: check that attributes and shapes are compatible
  } else {
    error("Import files contain incompatible data layers");
  }

  if (!dest.arcs) {
    dest.arcs = src.arcs;
  } else if (src.arcs) {
    error("Import files contain incompatible arc data");
  }
  utils.extend(dest.info, src.info);
};

gui.importFile = function(file, opts, cb) {
  var reader = new FileReader(),
      isBinary = MapShaper.isBinaryFile(file.name);
  reader.onload = function(e) {
    gui.inputFileContent(file.name, reader.result, opts, cb);
  };
  // TODO: improve to handle encodings, etc.
  if (isBinary) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file, 'UTF-8');
  }
};

// Index of imported objects, indexed by path base and then file type
// e.g. {"shapefiles/states": {"dbf": [obj], "shp": [obj]}}
gui.inputFileContent = function(path, content, importOpts, cb) {
  var dataset = gui.getImportDataset(utils.getFileBase(path)),
      type = MapShaper.guessInputFileType(path),
      input;

  if (type == 'shp' || type == 'json') {
    if (dataset.info.editing) {
      console.log("Editing has started; ignoring file:", path);
      return;
    }
    // TODO: remove this
    importOpts.files = [path];

    El("#mshp-intro-screen").hide();
    dataset.info.editing = true;
    input = {};
    input[type] = {
      content: content,
      filename: path
    };
    // kludge so the intro screen is hidden before importing freezes the UI.
    setTimeout(function() {
      var importData = MapShaper.importContent(input, importOpts);
      if (importData.arcs) {
        MapShaper.simplifyPaths(importData.arcs, importOpts);
        if (importOpts.keep_shapes) {
          MapShaper.keepEveryPolygon(importData.arcs, importData.layers);
        }
      }
      gui.mergeImportDataset(dataset, importData);
      cb(null, dataset);
    }, 10);

  } else if (type == 'dbf') {
    // TODO: detect dbf encoding instead of using ascii
    // (Currently, records are read if Shapefile is converted to *JSON).
    // TODO: validate table (check that record count matches, etc)
    gui.mergeImportDataset(dataset, {
      layers: [{data: new ShapefileTable(content, 'ascii')}]
    });

  } else if (type == 'prj') {
    dataset.info.output_prj = content;

  } else {
    console.log("Unexpected file type: " + path + '; ignoring');
  }
};
