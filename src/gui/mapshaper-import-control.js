/* @requires
mapshaper-zip-reader
mapshaper-progress-message
mapshaper-gui-options
*/

// tests if filename is a type that can be used
gui.isReadableFileType = function(filename) {
  var ext = utils.getFileExtension(filename).toLowerCase();
  return !!MapShaper.guessInputFileType(filename) || MapShaper.couldBeDsvFile(filename) ||
    MapShaper.isZipFile(filename);
};

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
    .addClass('file-control').appendTo('body')
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

function ImportControl(model, opts) {
  new SimpleButton('#import-buttons .submit-btn').on('click', submitFiles);
  new SimpleButton('#import-buttons .cancel-btn').on('click', model.clearMode);
  var importCount = 0;
  var queuedFiles = [];
  var manifestFiles = opts.files || [];
  model.addMode('import', turnOn, turnOff);
  new DropControl(receiveFiles);
  new FileChooser('#file-selection-btn', receiveFiles);
  new FileChooser('#import-buttons .add-btn', receiveFiles);
  new FileChooser('#add-file-btn', receiveFiles);
  model.enterMode('import');
  model.on('mode', function(e) {
    // re-open import opts if leaving alert or console modes and nothing has been imported yet
    if (!e.name && importCount === 0) {
      model.enterMode('import');
    }
  });

  function findMatchingShp(filename) {
    var shpName = utils.replaceFileExtension(filename, 'shp');
    return model.getDatasets().filter(function(d) {
      return shpName == d.info.input_files[0];
    });
  }

  function turnOn() {
    var el = El('#import-options');
    if (manifestFiles.length > 0) {
      downloadFiles(manifestFiles);
      manifestFiles = [];
    } else {
      if (importCount > 0) {
        el.removeClass('first-run');
      }
      el.show();
    }
  }

  function turnOff() {
    gui.clearProgressMessage();
    clearFiles();
    close();
  }

  function close() {
    El('#fork-me').hide();
    El('#import-options').hide();
  }


  function clearFiles() {
    queuedFiles = [];
    El('#dropped-file-list .file-list').empty();
    El('#dropped-file-list').hide();
  }

  function addFiles(files) {
    var index = {};
    queuedFiles = queuedFiles.concat(files).reduce(function(memo, f) {
      // filter out unreadable types and dupes
      if (gui.isReadableFileType(f.name) && f.name in index === false) {
        index[f.name] = true;
        memo.push(f);
      }
      return memo;
    }, []);
    // sort alphabetically by filename
    queuedFiles.sort(function(a, b) {
      return a.name > b.name ? 1 : -1;
    });
  }

  function showQueuedFiles() {
    var list = El('#dropped-file-list .file-list').empty();
    El('#dropped-file-list').show();
    queuedFiles.forEach(function(f) {
      El('<p>').text(f.name).appendTo(El("#dropped-file-list .file-list"));
    });
  }

  function receiveFiles(files) {
    var prevSize = queuedFiles.length;
    addFiles(utils.toArray(files));
    if (queuedFiles.length === 0) return;
    model.enterMode('import');
    if (importCount === 0 && prevSize === 0 && containsImmediateFile(queuedFiles)) {
      // if the first batch of files will be imported, process right away
      submitFiles();
    } else {
      showQueuedFiles();
      El('#import-buttons').show();
    }
  }

  // Check if an array of File objects contains a file that should be imported right away
  function containsImmediateFile(files) {
    return utils.some(files, function(f) {
        var type = MapShaper.guessInputFileType(f.name);
        return type == 'shp' || type == 'json';
    });
  }

  function submitFiles() {
    close();
    readNext();
  }

  function readNext() {
    if (queuedFiles.length > 0) {
      readFile(queuedFiles.pop()); // read in rev. alphabetic order, so .shp comes before .dbf
    } else {
      model.clearMode();
    }
  }

  function getImportOpts() {
    var freeform = El('#import-options .advanced-options').node().value,
        opts = gui.parseFreeformOptions(freeform, 'i');
    opts.no_repair = !El("#repair-intersections-opt").node().checked;
    opts.auto_snap = !!El("#snap-points-opt").node().checked;
    return opts;
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

  // @file a File object
  function readFile(file) {
    if (MapShaper.isZipFile(file.name)) {
      readZipFile(file);
    } else {
      loadFile(file, function(err, content) {
        if (err) {
          readNext();
        } else {
          readFileContent(file.name, content);
        }
      });
    }
  }

  function readFileContent(name, content) {
    var type = MapShaper.guessInputType(name, content),
        importOpts = getImportOpts(),
        matches = findMatchingShp(name),
        dataset, lyr;

    // TODO: refactor
    if (type == 'dbf' && matches.length > 0) {
      // find an imported .shp layer that is missing attribute data
      // (if multiple matches, try to use the most recently imported one)
      dataset = matches.reduce(function(memo, d) {
        if (!d.layers[0].data) {
          memo = d;
        }
        return memo;
      }, null);
      if (dataset) {
        lyr = dataset.layers[0];
        lyr.data = new MapShaper.ShapefileTable(content, importOpts.encoding);
        if (lyr.shapes && lyr.data.size() != lyr.shapes.length) {
          stop("Different number of records in .shp and .dbf files");
        }
        if (!lyr.geometry_type) {
          // kludge: trigger display of table cells if .shp has null geometry
          model.updated(null, lyr, dataset);
        }
        readNext();
        return;
      }
    }

    if (type == 'prj') {
      // assumes that .shp has been imported first
      matches.forEach(function(d) {
        if (!d.info.input_prj) {
          d.info.input_prj = content;
        }
      });
      readNext();
      return;
    }

    importFileContent(type, name, content, importOpts);
  }

  function importFileContent(type, path, content, importOpts) {
    var size = content.byteLength || content.length, // ArrayBuffer or string
        showMsg = size > 4e7, // don't show message if dataset is small
        delay = 0;
    importOpts.files = [path]; // TODO: try to remove this
    if (showMsg) {
      gui.showProgressMessage('Importing');
      delay = 35;
    }
    setTimeout(function() {
      var dataset = MapShaper.importFileContent(content, path, importOpts);
      dataset.info.no_repair = importOpts.no_repair;
      model.addDataset(dataset);
      importCount++;
      readNext();
    }, delay);
  }

  function readZipFile(file) {
    gui.showProgressMessage('Importing');
    setTimeout(function() {
      gui.readZipFile(file, function(err, files) {
        if (err) {
          console.log("Zip file loading failed:");
          throw err;
        }
        // don't try to import .txt files from zip files
        // (these would be parsed as dsv and throw errows)
        files = files.filter(function(f) {
          return !/\.txt$/i.test(f.name);
        });
        addFiles(files);
        readNext();
      });
    }, 35);
  }

  function prepFilesForDownload(names) {
    var items = names.map(function(name) {
      var isUrl = /:\/\//.test(name);
      var item = {name: name};
      if (isUrl) {
        item.url = name;
        item.basename = gui.getUrlFilename(name);
      } else {
        item.basename = name;
        // Assume non-urls are local files loaded via mapshaper-gui
        item.url = '/data/' + name;
      }
      return gui.isReadableFileType(item.basename) ? item : null;
    });
    return items.filter(Boolean);
  }

  function downloadFiles(paths, opts) {
    var items = prepFilesForDownload(paths);
    utils.reduceAsync(items, [], downloadNextFile, function(err, files) {
      if (err) {
        gui.alert(err);
      } else if (!files.length) {
        model.clearMode();
      } else {
        addFiles(files);
        submitFiles();
      }
    });
  }

  function downloadNextFile(memo, item, next) {
    var req = new XMLHttpRequest();
    var blob;
    req.responseType = 'blob';
    req.addEventListener('load', function(e) {
      if (req.status == 200) {
        blob = req.response;
      }
    });
    req.addEventListener('loadend', function() {
      var err;
      if (req.status == 404) {
        err = "Not&nbsp;found:&nbsp;" + item.name;
      } else if (!blob) {
        // Errors like DNS lookup failure, no CORS headers, no network connection
        // all are status 0 - it seems impossible to show a more specific message
        // actual reason is displayed on the console
        err = "Error&nbsp;loading&nbsp;" + item.name + ". Possible causes include: wrong URL, no network connection, server not configured for cross-domain sharing (CORS).";
      } else {
        blob.name = item.basename;
        memo.push(blob);
      }
      next(err, memo);
    });
    req.open('GET', item.url);
    req.send();
  }
}
