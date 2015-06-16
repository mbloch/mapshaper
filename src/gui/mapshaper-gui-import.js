/* @requires mapshaper-gui-lib, mapshaper-import, mapshaper-progress-bar */


// Cache and merge data from Shapefile component files (.prj, .dbf, shp) in
// whatever order they are received in.
//
gui.receiveShapefileComponent = (function() {
  var cache = {};

  function merge() {
    var dataset = cache.shp,
        lyr, info;
    if (dataset) {
      lyr = dataset.layers[0];
      info = dataset.info;
      // only use prj or dbf if the dataset lacks this info
      // (the files could be intended for a future re-import of .shp content)
      if (cache.prj && !info.output_prj) {
        info.output_prj = cache.prj;
      }
      if (cache.dbf && !lyr.data) {
        // TODO: detect dbf encoding instead of using ascii
        // (Currently, records are read if Shapefile is converted to *JSON).
        // TODO: validate table (check that record count matches, etc)
        lyr.data = new ShapefileTable(cache.dbf, 'ascii');
        delete cache.dbf;
      }
    }
  }

  // @content: imported dataset if .shp, raw file content if other file type
  return function(path, content) {
    var name = utils.getFileBase(path),
        ext = utils.getFileExtension(path).toLowerCase();
    if (name != cache.name) {
      cache = {name: name};
    }
    cache[ext] = content;
    merge();
  };
}());

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
  var type = MapShaper.guessInputFileType(path),
      size = content.byteLength || content.length, // ArrayBuffer or string
      progressBar;

  // these file types can be imported and edited right away
  if (type == 'shp' || type == 'json') {
    El("#mshp-intro-screen").hide();
    progressBar = new ProgressBar('#page-wrapper');
    if (size < 4e7) progressBar.remove(); // don't show for small datasets
    progressBar.update(0.2, "Importing");

    // Import data in steps, so browser can refresh the progress bar; add enough
    //   timeout delay for Firefox to refresh (may not work everywhere).
    gui.queueSync(25)
      .defer(function() {
        importOpts.files = [path]; // TODO: try to remove this
        var dataset = MapShaper.importFileContent(content, path, importOpts);
        progressBar.update(0.6, "Presimplifying");
        return dataset;
      })
      .defer(function(dataset) {
        if (dataset.arcs) {
          MapShaper.simplifyPaths(dataset.arcs, importOpts);
          if (importOpts.keep_shapes) {
            MapShaper.keepEveryPolygon(dataset.arcs, dataset.layers);
          }
        }
        return dataset;
      })
      .await(function(dataset) {
        if (type == 'shp') {
          gui.receiveShapefileComponent(path, dataset);
        }
        progressBar.remove();
        cb(null, dataset);
      });

  // merge auxiliary Shapefile files with .shp content
  } else if (type == 'dbf' || type == 'prj') {
    gui.receiveShapefileComponent(path, content);

  } else {
    console.log("Unexpected file type: " + path + '; ignoring');
  }
};
