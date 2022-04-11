import { CatalogControl } from './gui-catalog-control';
import './gui-zip-reader';
import { utils, internal, stop } from './gui-core';
import { El } from './gui-el';
import { SimpleButton } from './gui-elements';
import { GUI } from './gui-lib';

// @cb function(<FileList>)
function DropControl(gui, el, cb) {
  var area = El(el);
  // blocking drag events enables drop event
  area.on('dragleave', block)
      .on('dragover', block)
      .on('drop', ondrop)
      .on('paste', onpaste);
  area.node().addEventListener('paste', onpaste);
  function ondrop(e) {
    block(e);
    cb(e.dataTransfer.files);
  }
  function onpaste(e) {
    var types = Array.from(e.clipboardData.types || []).join(',');
    var items = Array.from(e.clipboardData.items || []);
    var files;
    if (GUI.textIsSelected()) {
      // user is probably pasting text into an editable text field
      return;
    }
    block(e);
    // Browser compatibility (tested on MacOS only):
    // Chrome and Safari: full support
    // FF: supports pasting JSON and CSV from the clipboard but not files.
    //     Single files of all types are pasted as a string and an image/png
    //     Multiple files are pasted as a string containing a list of file names
    if (types == 'text/plain') {
      // text from clipboard (supported by Chrome, FF, Safari)
      // TODO: handle FF case of string containing multiple file names.
      files = [pastedTextToFile(e.clipboardData.getData('text/plain'))];
    } else {
      files = items.map(function(item) {
        return item.kind == 'file' && !item.type.includes('image') ?
          item.getAsFile() : null;
      });
    }
    files = files.filter(Boolean);
    if (files.length) {
      cb(files);
    } else {
      gui.alert('Pasted content could not be imported.');
    }
  }
  function block(e) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function pastedTextToFile(str) {
  var type = internal.guessInputContentType(str);
  var name;
  if (type == 'text') {
    name = 'pasted.txt';
  } else if (type == 'json') {
    name = 'pasted.json';
  } else {
    return null;
  }
  var blob = new Blob([str]);
  return new File([blob], name);
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
  var initialImport = true;
  var importCount = 0;
  var importTotal = 0;
  var overQuickView = false;
  var queuedFiles = [];
  var manifestFiles = opts.files || [];
  var catalog;

  if (opts.catalog) {
    catalog = new CatalogControl(gui, opts.catalog, downloadFiles);
  }

  new SimpleButton('#import-buttons .submit-btn').on('click', importQueuedFiles);
  new SimpleButton('#import-buttons .cancel-btn').on('click', gui.clearMode);
  new DropControl(gui, 'body', receiveFiles);
  new FileChooser('#file-selection-btn', receiveFiles);
  new FileChooser('#import-buttons .add-btn', receiveFiles);
  new FileChooser('#add-file-btn', receiveFiles);
  initDropArea('#import-quick-drop', true);
  initDropArea('#import-drop');
  gui.keyboard.onMenuSubmit(El('#import-options'), importQueuedFiles);

  gui.addMode('import', turnOn, turnOff);
  gui.enterMode('import');

  gui.on('mode', function(e) {
    // re-open import opts if leaving alert or console modes and nothing has been imported yet
    if (!e.name && model.isEmpty()) {
      gui.enterMode('import');
    }
  });

  function useQuickView() {
    return initialImport && (opts.quick_view || overQuickView);
  }

  function initDropArea(el, isQuick) {
    var area = El(el)
      .on('dragleave', onout)
      .on('dragover', onover)
      .on('mouseover', onover)
      .on('mouseout', onout);

    function onover() {
      overQuickView = !!isQuick;
      area.addClass('dragover');
    }
    function onout() {
      overQuickView = false;
      area.removeClass('dragover');
    }
  }

  async function importQueuedFiles() {
    gui.container.removeClass('queued-files');
    gui.container.removeClass('splash-screen');
    var files = queuedFiles;
    try {
      if (files.length > 0) {
        queuedFiles = [];
        await importFiles(files);
      }
    } catch(e) {
      console.error(e);
    }
    gui.clearMode();
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
      onImportComplete();
      importTotal += importCount;
      importCount = 0;
    }
    gui.clearProgressMessage();
    initialImport = false; // unset 'quick view' mode, if on
    clearQueuedFiles();
  }

  function onImportComplete() {
    // display last layer of last imported dataset
    // target = model.getDefaultTargets()[0];
    // model.selectLayer(target.layers[target.layers.length-1], target.dataset);
    if (opts.target && importTotal === 0) {
      var target = model.findCommandTargets(opts.target)[0];
      if (target) {
        model.setDefaultTarget([target.layers[0]], target.dataset);
      }
    }
    model.updated({select: true});

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

  function showQueuedFiles() {
    var list = gui.container.findChild('.dropped-file-list').empty();
    queuedFiles.forEach(function(f) {
      El('<p>').text(f.name).appendTo(list);
    });
  }

  async function receiveFiles(files) {
    // TODO: show importing message here?
    var expanded = await expandFiles(files);
    addFilesToQueue(expanded);
    if (queuedFiles.length === 0) return;
    gui.enterMode('import');
    if (useQuickView()) {
      importQueuedFiles();
    } else {
      gui.container.addClass('queued-files');
      El('#path-import-options').classed('hidden', !filesMayContainPaths(queuedFiles));
      showQueuedFiles();
    }
  }

  async function expandFiles(files) {
    var files2 = [], expanded;
    for (var f of files) {
      if (internal.isZipFile(f.name) || /\.kmz$/.test(f.name)) {
        expanded = await readZipFile(f);
        files2 = files2.concat(expanded);
      } else {
        files2.push(f);
      }
    }
    return files2;
  }

  async function importFiles(files) {
    var fileData = await readFiles(files);
    var importOpts = readImportOpts();
    var groups = groupFilesForImport(fileData, importOpts);
    for (var group of groups) {
      if (group.size > 4e7) {
        gui.showProgressMessage('Importing');
        await wait(35);
      }
      importDataset(group, importOpts);
    }
  }

  function importDataset(group, importOpts) {
    var optStr = GUI.formatCommandOptions(importOpts);
    var dataset = internal.importContent(group, importOpts);
    if (datasetIsEmpty(dataset)) return;
    if (group.layername) {
      dataset.layers.forEach(lyr => lyr.name = group.layername);
    }
    // save import options for use by repair control, etc.
    dataset.info.import_options = importOpts;
    model.addDataset(dataset);
    importCount++;
    gui.session.fileImported(group.filename, optStr);
  }

  function filesMayContainPaths(files) {
    return utils.some(files, function(f) {
        var type = internal.guessInputFileType(f.name);
        return type == 'shp' || type == 'json' || internal.isZipFile(f.name);
    });
  }

  function datasetIsEmpty(dataset) {
    return dataset.layers.every(function(lyr) {
      return internal.getFeatureCount(lyr) === 0;
    });
  }


  // TODO: support .cpg
  function isShapefilePart(name) {
    return /\.(shp|shx|dbf|prj)$/i.test(name);
  }

  function readImportOpts() {
    var importOpts;
    if (useQuickView()) {
      importOpts = {}; // default opts using quickview
    } else {
      var freeform = El('#import-options .advanced-options').node().value;
      importOpts = GUI.parseFreeformOptions(freeform, 'i');
      importOpts.no_repair = !El("#repair-intersections-opt").node().checked;
      importOpts.snap = !!El("#snap-points-opt").node().checked;
    }
    return importOpts;
  }

  // @file a File object
  async function readContentFileAsync(file, cb) {
    var name = file.name,
        reader = new FileReader(),
        useBinary = internal.isSupportedBinaryInputType(name) ||
          internal.isZipFile(name) ||
          internal.guessInputFileType(name) == 'json' ||
          internal.guessInputFileType(name) == 'text';

    reader.addEventListener('loadend', function(e) {
      if (!reader.result) {
        cb(new Error());
      } else {
        cb(null, reader.result);
      }
    });
    if (useBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      // TODO: consider using "encoding" option, to support CSV files in other encodings than utf8
      reader.readAsText(file, 'UTF-8');
    }
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
    var blob, err;
    fetch(item.url).then(resp => resp.blob()).then(b => {
      blob = b;
      blob.name = item.basename;
      memo.push(blob);
    }).catch(e => {
      err = "Error&nbsp;loading&nbsp;" + item.name + ". Possible causes include: wrong URL, no network connection, server not configured for cross-domain sharing (CORS).";
    }).finally(() => {
      next(err, memo);
    });
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function runAsync(fn, arg) {
    return new Promise((resolve, reject) => {
      fn(arg, function(err, data) {
        return err ? reject(err) : resolve(data);
      });
    });
  }

  async function readZipFile(file) {
    var files;
    await wait(35); // pause a beat so status message can display
    try {
      files = await runAsync(GUI.readZipFile, file);
      // don't try to import .txt files from zip files
      // (these would be parsed as dsv and throw errows)
      files = files.filter(function(f) {
        return !/\.txt$/i.test(f.name);
      });
    } catch(e) {
      handleImportError(e, file.name);
      files = [];
    }
    return files;
  }

  async function readFileData(file) {
    try {
      var content = await runAsync(readContentFileAsync, file);
      return {
        content: content,
        size: content.byteLength || content.length, // ArrayBuffer or string
        name: file.name,
        basename: internal.getFileBase(file.name).toLowerCase(),
        type: internal.guessInputType(file.name, content)
      };
    } catch (e) {
      handleImportError("Web browser was unable to load the file.", file.name);
    }
    return null;
  }

  async function readFiles(files) {
    var data = [], d;
    for (var file of files) {
      d = await readFileData(file);
      if (d) data.push(d);
    }
    return data;
  }

  function groupFilesForImport(data, importOpts) {
    var names = importOpts.name ? [importOpts.name] : null;
    if (initialImport && opts.name) { // name from mapshaper-gui --name option
      names = opts.name.split(',');
    }

    function key(basename, type) {
      return basename + '.' + type;
    }
    function hasShp(basename) {
      var shpKey = key(basename, 'shp');
      return data.some(d => key(d.basename, d.type) == shpKey);
    }
    data.forEach(d => {
      if (d.type == 'shp' || !isShapefilePart(d.name)) {
        d.group = key(d.basename, d.type);
        d.filename = d.name;
      } else if (hasShp(d.basename)) {
        d.group = key(d.basename, 'shp');
      } else if (d.type == 'dbf') {
        d.filename = d.name;
        d.group = key(d.basename, 'dbf');
      } else {
        // shapefile part without a .shp file
        d.group = null;
      }
    });
    var index = {};
    var groups = [];
    data.forEach(d => {
      if (!d.group) return;
      var g = index[d.group];
      if (!g) {
        g = {};
        g.layername = names ? names[groups.length] || names[names.length - 1] : null;
        groups.push(g);
        index[d.group] = g;
      }
      g.size = (g.size || 0) + d.size; // accumulate size
      g[d.type] = {
        filename: d.name,
        content: d.content
      };
      // kludge: stash import name for session history
      if (d.filename) g.filename = d.filename;
    });
    return groups;
  }
}
