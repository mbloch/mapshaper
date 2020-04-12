import { CatalogControl } from './gui-catalog-control';
import './gui-zip-reader';
import { utils, internal, stop } from './gui-core';
import { El } from './gui-el';
import { SimpleButton } from './gui-elements';
import { GUI } from './gui-lib';

// @cb function(<FileList>)
function DropControl(el, cb) {
  var area = El(el);
  area.on('dragleave', ondragleave)
      .on('dragover', ondragover)
      .on('drop', ondrop);
  function ondragleave(e) {
    block(e);
    out();
  }
  function ondragover(e) {
    // blocking drag events enables drop event
    block(e);
    over();
  }
  function ondrop(e) {
    block(e);
    out();
    cb(e.dataTransfer.files);
  }
  function over() {
    area.addClass('dragover');
  }
  function out() {
    area.removeClass('dragover');
  }
  function block(e) {
    e.preventDefault();
    e.stopPropagation();
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

export function ImportControl(gui, opts) {
  var model = gui.model;
  var importCount = 0;
  var useQuickView = opts.quick_view; // may be set by mapshaper-gui
  var queuedFiles = [];
  var manifestFiles = opts.files || [];
  var cachedFiles = {};
  var catalog;

  if (opts.catalog) {
    catalog = new CatalogControl(gui, opts.catalog, downloadFiles);
  }

  new SimpleButton('#import-buttons .submit-btn').on('click', onSubmit);
  new SimpleButton('#import-buttons .cancel-btn').on('click', gui.clearMode);
  new DropControl('body', receiveFiles); // default drop area is entire page
  new DropControl('#import-drop', receiveFiles);
  new DropControl('#import-quick-drop', receiveFilesQuickView);
  new FileChooser('#file-selection-btn', receiveFiles);
  new FileChooser('#import-buttons .add-btn', receiveFiles);
  new FileChooser('#add-file-btn', receiveFiles);

  gui.keyboard.onMenuSubmit(El('#import-options'), onSubmit);

  gui.addMode('import', turnOn, turnOff);
  gui.enterMode('import');

  gui.on('mode', function(e) {
    // re-open import opts if leaving alert or console modes and nothing has been imported yet
    if (!e.name && model.isEmpty()) {
      gui.enterMode('import');
    }
  });

  function findMatchingShp(filename) {
    // use case-insensitive matching
    var base = internal.getPathBase(filename).toLowerCase();
    return model.getDatasets().filter(function(d) {
      var fname = d.info.input_files && d.info.input_files[0] || "";
      var ext = internal.getFileExtension(fname).toLowerCase();
      var base2 = internal.getPathBase(fname).toLowerCase();
      return base == base2 && ext == 'shp';
    });
  }

  function turnOn() {
    if (manifestFiles.length > 0) {
      downloadFiles(manifestFiles, true);
      manifestFiles = [];
    } else if (model.isEmpty()) {
      gui.container.addClass('splash-screen');
    }
  }

  function turnOff() {
    var target;
    if (catalog) catalog.reset(); // re-enable clickable catalog
    if (importCount > 0) {
      // display last layer of last imported dataset
      // target = model.getDefaultTargets()[0];
      // model.selectLayer(target.layers[target.layers.length-1], target.dataset);
      model.updated({select: true});
    }
    gui.clearProgressMessage();
    importCount = 0;
    useQuickView = false; // unset 'quick view' mode, if on
    close();
  }

  function close() {
    clearQueuedFiles();
    cachedFiles = {};
  }

  function clearQueuedFiles() {
    queuedFiles = [];
    gui.container.removeClass('queued-files');
    gui.container.findChild('.dropped-file-list').empty();
  }

  function addFilesToQueue(files) {
    var index = {};
    queuedFiles = queuedFiles.concat(files).reduce(function(memo, f) {
      // filter out unreadable types and dupes
      if (GUI.isReadableFileType(f.name) && f.name in index === false) {
        index[f.name] = true;
        memo.push(f);
      }
      return memo;
    }, []);
  }

  // When a Shapefile component is at the head of the queue, move the entire
  // Shapefile to the front of the queue, sorted in reverse alphabetical order,
  // (a kludge), so .shp is read before .dbf and .prj
  // (If a .dbf file is imported before a .shp, it becomes a separate dataset)
  // TODO: import Shapefile parts without relying on this kludge
  function sortQueue(queue) {
    var nextFile = queue[0];
    var basename, parts;
    if (!isShapefilePart(nextFile.name)) {
      return queue;
    }
    basename = internal.getFileBase(nextFile.name).toLowerCase();
    parts = [];
    queue = queue.filter(function(file) {
      if (internal.getFileBase(file.name).toLowerCase() == basename) {
        parts.push(file);
        return false;
      }
      return true;
    });
    parts.sort(function(a, b) {
      // Sorting on LC filename so Shapefiles with mixed-case
      // extensions are sorted correctly
      return a.name.toLowerCase() < b.name.toLowerCase() ? 1 : -1;
    });
    return parts.concat(queue);
  }

  function showQueuedFiles() {
    var list = gui.container.findChild('.dropped-file-list').empty();
    queuedFiles.forEach(function(f) {
      El('<p>').text(f.name).appendTo(list);
    });
  }

  function receiveFilesQuickView(files) {
    useQuickView = true;
    receiveFiles(files);
  }

  function receiveFiles(files) {
    var prevSize = queuedFiles.length;
    files = handleZipFiles(utils.toArray(files));
    addFilesToQueue(files);
    if (queuedFiles.length === 0) return;
    gui.enterMode('import');

    if (useQuickView) {
      onSubmit();
    } else {
      gui.container.addClass('queued-files');
      El('#path-import-options').classed('hidden', !filesMayContainPaths(queuedFiles));
      showQueuedFiles();
    }
  }

  function filesMayContainPaths(files) {
    return utils.some(files, function(f) {
        var type = internal.guessInputFileType(f.name);
        return type == 'shp' || type == 'json' || internal.isZipFile(f.name);
    });
  }

  function onSubmit() {
    gui.container.removeClass('queued-files');
    gui.container.removeClass('splash-screen');
    procNextQueuedFile();
  }

  function addDataset(dataset) {
    if (!datasetIsEmpty(dataset)) {
      model.addDataset(dataset);
      importCount++;
    }
    procNextQueuedFile();
  }

  function datasetIsEmpty(dataset) {
    return dataset.layers.every(function(lyr) {
      return internal.getFeatureCount(lyr) === 0;
    });
  }

  function procNextQueuedFile() {
    if (queuedFiles.length === 0) {
      gui.clearMode();
    } else {
      queuedFiles = sortQueue(queuedFiles);
      readFile(queuedFiles.shift());
    }
  }

  // TODO: support .cpg
  function isShapefilePart(name) {
    return /\.(shp|shx|dbf|prj)$/i.test(name);
  }


  function readImportOpts() {
    if (useQuickView) return {};
    var freeform = El('#import-options .advanced-options').node().value,
        opts = GUI.parseFreeformOptions(freeform, 'i');
    opts.no_repair = !El("#repair-intersections-opt").node().checked;
    opts.snap = !!El("#snap-points-opt").node().checked;
    return opts;
  }

  // for CLI output
  function readImportOptsAsString() {
    if (useQuickView) return '';
    var freeform = El('#import-options .advanced-options').node().value;
    var opts = readImportOpts();
    if (opts.snap) freeform = 'snap ' + freeform;
    return freeform.trim();
  }

  // @file a File object
  function readFile(file) {
    var name = file.name,
        reader = new FileReader(),
        useBinary = internal.isSupportedBinaryInputType(name) ||
          internal.isZipFile(name) ||
          internal.guessInputFileType(name) == 'json' ||
          internal.guessInputFileType(name) == 'text';

    reader.addEventListener('loadend', function(e) {
      if (!reader.result) {
        handleImportError("Web browser was unable to load the file.", name);
      } else {
        importFileContent(name, reader.result);
      }
    });
    if (useBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      // TODO: consider using "encoding" option, to support CSV files in other encodings than utf8
      reader.readAsText(file, 'UTF-8');
    }
  }

  function importFileContent(fileName, content) {
    var fileType = internal.guessInputType(fileName, content),
        importOpts = readImportOpts(),
        matches = findMatchingShp(fileName),
        dataset, lyr;

    // Add dbf data to a previously imported .shp file with a matching name
    // (.shp should have been queued before .dbf)
    if (fileType == 'dbf' && matches.length > 0) {
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
        lyr.data = new internal.ShapefileTable(content, importOpts.encoding);
        if (lyr.shapes && lyr.data.size() != lyr.shapes.length) {
          stop("Different number of records in .shp and .dbf files");
        }
        if (!lyr.geometry_type) {
          // kludge: trigger display of table cells if .shp has null geometry
          // TODO: test case if lyr is not the current active layer
          model.updated({});
        }
        procNextQueuedFile();
        return;
      }
    }

    if (fileType == 'shx') {
      // save .shx for use when importing .shp
      // (queue should be sorted so that .shx is processed before .shp)
      cachedFiles[fileName.toLowerCase()] = {filename: fileName, content: content};
      procNextQueuedFile();
      return;
    }

    // Add .prj file to previously imported .shp file
    if (fileType == 'prj') {
      matches.forEach(function(d) {
        if (!d.info.prj) {
          d.info.prj = content;
        }
      });
      procNextQueuedFile();
      return;
    }

    importNewDataset(fileType, fileName, content, importOpts);
  }

  function importNewDataset(fileType, fileName, content, importOpts) {
    var size = content.byteLength || content.length, // ArrayBuffer or string
        delay = 0;

    // show importing message if file is large
    if (size > 4e7) {
      gui.showProgressMessage('Importing');
      delay = 35;
    }
    setTimeout(function() {
      var dataset;
      var input = {};
      try {
        input[fileType] = {filename: fileName, content: content};
        if (fileType == 'shp') {
          // shx file should already be cached, if it was added together with the shp
          input.shx = cachedFiles[fileName.replace(/shp$/i, 'shx').toLowerCase()] || null;
        }
        dataset = internal.importContent(input, importOpts);
        // save import options for use by repair control, etc.
        dataset.info.import_options = importOpts;
        gui.session.fileImported(fileName, readImportOptsAsString());
        addDataset(dataset);

      } catch(e) {
        handleImportError(e, fileName);
      }
    }, delay);
  }

  function handleImportError(e, fileName) {
    var msg = utils.isString(e) ? e : e.message;
    if (fileName) {
      msg = "Error importing <i>" + fileName + "</i><br>" + msg;
    }
    clearQueuedFiles();
    gui.alert(msg);
    console.error(e);
  }

  function handleZipFiles(files) {
    return files.filter(function(file) {
      var isZip = internal.isZipFile(file.name);
      if (isZip) {
        importZipFile(file);
      }
      return !isZip;
    });
  }

  function importZipFile(file) {
    // gui.showProgressMessage('Importing');
    setTimeout(function() {
      GUI.readZipFile(file, function(err, files) {
        if (err) {
          handleImportError(err, file.name);
        } else {
          // don't try to import .txt files from zip files
          // (these would be parsed as dsv and throw errows)
          files = files.filter(function(f) {
            return !/\.txt$/i.test(f.name);
          });
          receiveFiles(files);
        }
      });
    }, 35);
  }

  function prepFilesForDownload(names) {
    var items = names.map(function(name) {
      var isUrl = /:\/\//.test(name);
      var item = {name: name};
      if (isUrl) {
        item.url = name;
        item.basename = GUI.getUrlFilename(name);

      } else {
        item.basename = name;
        // Assume non-urls are local files loaded via gui-gui
        item.url = '/data/' + name;
        item.url = item.url.replace('/../', '/~/'); // kludge to allow accessing one parent
      }
      return GUI.isReadableFileType(item.basename) ? item : null;
    });
    return items.filter(Boolean);
  }

  function downloadFiles(paths) {
    var items = prepFilesForDownload(paths);
    utils.reduceAsync(items, [], downloadNextFile, function(err, files) {
      if (err) {
        gui.alert(err);
      } else if (!files.length) {
        gui.clearMode();
      } else {
        receiveFiles(files);
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
    req.addEventListener('progress', function(e) {
      var pct = e.loaded / e.total;
      if (catalog) catalog.progress(pct);
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
