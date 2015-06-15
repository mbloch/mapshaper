/* @requires mapshaper-gui-lib, mapshaper-import, mapshaper-progress-bar */

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

gui.inputFileContent = function(path, content, importOpts, cb) {
  var dataset = gui.getImportDataset(utils.getFileBase(path)),
      type = MapShaper.guessInputFileType(path),
      size = content.byteLength || content.length, // ArrayBuffer or string
      progressBar;

  if (type == 'shp' || type == 'json') {
    if (gui.state == 'editing') { // TODO: remove this kludge
      console.log("Editing has started; ignoring file:", path);
      return;
    }
    gui.state = 'editing';
    El("#mshp-intro-screen").hide();

    progressBar = new ProgressBar('#page-wrapper');
    if (size < 6e7) progressBar.remove(); // don't show for small datasets
    progressBar.update(0.2, "Importing");

    // Import data in steps, so browser can refresh the progress bar
    gui.queueSync()
      .defer(function() {
        importOpts.files = [path]; // TODO: remove this
        var dataset2 = MapShaper.importFileContent(content, path, importOpts);
        gui.mergeImportDataset(dataset, dataset2);
        progressBar.update(0.6, "Presimplifying");
      })
      .defer(function() {
        if (dataset.arcs) {
          MapShaper.simplifyPaths(dataset.arcs, importOpts);
          if (importOpts.keep_shapes) {
            MapShaper.keepEveryPolygon(dataset.arcs, dataset.layers);
          }
        }
      })
      .await(function() {
        progressBar.remove();
        cb(null, dataset);
      });

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
