/* @requires
mapshaper-data-table
mapshaper-zip-reader
mapshaper-progress-bar
mapshaper-import
*/

// @cb function(<FileList>)
function DropControl(cb) {
  var el = El('body');
  el.on('dragleave', ondrag);
  el.on('dragover', ondrag);
  el.on('drop', ondrop);
  function ondrag(e) {
    // blocking drag events enables drop event
    e.preventDefault();
  }
  function ondrop(e) {
    e.preventDefault();
    cb(e.dataTransfer.files);
  }
}

// @el DOM element for select button
// @cb function(<FileList>)
function FileChooser(el, cb) {
  var btn = El(el).on('click', function() {
    input.el.click();
  });
  var input = El('form')
    .addClass('g-file-control').appendTo('body')
    .newChild('input')
    .attr('type', 'file')
    .attr('multiple', 'multiple')
    .on('change', onchange);

  function onchange(e) {
    var files = e.target.files;
    // files may be undefined (e.g. if user presses 'cancel' after a file has been selected)
    if (files) {
      // disable the button while files are being processed
      btn.addClass('selected');
      input.attr('disabled', true);
      cb(files);
      btn.removeClass('selected');
      input.attr('disabled', false);
    }
  }
}

function ImportControl(model) {
  new SimpleButton('#import-buttons .submit-btn').on('click', submitFiles);
  new SimpleButton('#import-buttons .cancel-btn').on('click', cancelImport);
  var useCount = 0;
  var queuedFiles = [];
  var isOpen, precisionInput;

  El('#mshp-import').show(); // start with window open
  isOpen = true;
  new DropControl(receiveFiles);
  new FileChooser('#file-selection-btn', receiveFiles);

  precisionInput = new ClickText("#g-import-precision-opt")
    .bounds(0, Infinity)
    .formatter(function(str) {
      var val = parseFloat(str);
      return !val ? '' : String(val);
    })
    .validator(function(str) {
      return str === '' || utils.isNumber(parseFloat(str));
    });

  function open() {
    El('#import-buttons').show();
    El('#mshp-import').show();
    isOpen = true;
  }

  function close() {
   El('#mshp-import').hide();
   El('#import-intro').hide(); // only show intro at first
   isOpen = false;
  }

  function cancelImport(field) {
    clearFiles();
    close();
  }

  function clearFiles() {
    queuedFiles = [];
    El('#dropped-file-list .file-list').empty();
  }

  function receiveFiles(files) {
    files = utils.toArray(files);
    queuedFiles = queuedFiles.concat(files);
     // import files right away on first use -- the options dialog is already open
    if (useCount === 0) {
      submitFiles();
    } else {
      if (!isOpen) open();
      El('#dropped-file-list').show();
      files.forEach(function(f) {
        El('<p>').text(f.name).appendTo(El("#dropped-file-list .file-list"));
      });
    }
  }

  function submitFiles() {
    // TODO: handle potential issue where component files of several shapefiles
    // are imported in interleaved sequence.
    readFiles(queuedFiles);
    clearFiles();
    close();
  }

  function readFiles(files) {
    utils.forEach((files || []), readFile);
  }

  function getImportOpts() {
    var method = El('#g-simplification-menu input[name=method]:checked').attr('value') || null;
    return {
      method: method,
      no_repair: !El("#g-repair-intersections-opt").node().checked,
      keep_shapes: !!El("#g-import-retain-opt").node().checked,
      auto_snap: !!El("#g-snap-points-opt").node().checked,
      precision: precisionInput.value()
    };
  }

  function loadFile(file, cb) {
    var reader = new FileReader(),
        isBinary = MapShaper.isBinaryFile(file.name);
    // no callback on error -- fix?
    reader.onload = function(e) {
      cb(null, reader.result);
    };
    if (isBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      // TODO: improve to handle encodings, etc.
      reader.readAsText(file, 'UTF-8');
    }
  }

  function importFile(file) {
    loadFile(file, function(err, content) {
      var name = file.name;
      var type = MapShaper.guessInputType(name, content);
      if (type == 'shp' || type == 'json') {
        importFileContent(type, name, content);
      } else if (type == 'dbf' || type == 'prj') {
        // merge auxiliary Shapefile files with .shp content
        gui.receiveShapefileComponent(name, content);
      } else {
        console.log("Unexpected file type: " + name + '; ignoring');
      }
    });
  }

  function importFileContent(type, path, content) {
    var importOpts = getImportOpts(),
      size = content.byteLength || content.length, // ArrayBuffer or string
      showProgress = size > 4e7, // don't show progress bar for small datasets
      delay = showProgress ? 25 : 0, // timeout in ms; should be long enough for Firefox to refresh.
      progressBar = new ProgressBar(),
      dataset, queue;

    if (useCount++ === 0) {
      close();
      El('#fork-me').hide();
    }

    if (showProgress) progressBar.appendTo('body');
    progressBar.update(0.2, "Importing");
    // Import data with a delay before each step, so browser can refresh the progress bar
    queue = gui.queueSync()
      .defer(function() {
        importOpts.files = [path]; // TODO: try to remove this
        dataset = MapShaper.importFileContent(content, path, importOpts);
      }, delay);
    if (importOpts.method) {
      queue.defer(function() {
        progressBar.update(0.6, "Presimplifying");
      })
      .defer(function() {
        if (dataset.arcs) {
          MapShaper.simplifyPaths(dataset.arcs, importOpts);
          if (importOpts.keep_shapes) {
            MapShaper.keepEveryPolygon(dataset.arcs, dataset.layers);
          }
        }
      }, delay);
    }
    queue.await(function() {
      if (type == 'shp') {
        gui.receiveShapefileComponent(path, dataset);
      }
      progressBar.remove();
      onImport(dataset, importOpts);
    });
  }

  function onImport(dataset, opts) {
    model.setEditingLayer(dataset.layers[0], dataset, opts);
  }

  // @file a File object
  function readFile(file) {
    var name = file.name,
        ext = utils.getFileExtension(name).toLowerCase();
    if (ext == 'zip') {
      gui.readZipFile(file, function(err, files) {
        if (err) {
          console.log("Zip file loading failed:");
          throw err;
        }
        readFiles(files);
      });
    } else if (gui.isReadableFileType(name)) {
      if (!isOpen) {
        open();
      }
      importFile(file);
    } else {
      console.log("File can't be imported:", name, "-- skipping.");
    }
  }
}

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
        // TODO: handle unknown encodings interactively
        lyr.data = new ShapefileTable(cache.dbf);
        delete cache.dbf;
        if (lyr.data.size() != lyr.shapes.length) {
          lyr.data = null;
          stop("Different number of records in .shp and .dbf files");
        }
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
