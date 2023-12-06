import { CatalogControl } from './gui-catalog-control';
import { utils, internal, stop } from './gui-core';
import { El } from './gui-el';
import { SimpleButton } from './gui-elements';
import { GUI } from './gui-lib';
import { importSessionData } from './gui-session-snapshot-control.mjs';

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

    // import text from the clipboard (could be csv, json, etc)
    // formatted text can be available as both text/plain and text/html (e.g.
    //   a JSON data object copied from a GitHub issue).
    //
    if (types.includes('text/plain')) {
    // if (types == 'text/plain') {
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

  async function onchange(e) {
    var files = e.target.files;
    // files may be undefined (e.g. if user presses 'cancel' after a file has been selected)
    if (files) {
      // disable the button while files are being processed
      btn.addClass('selected');
      input.attr('disabled', true);
      await cb(files);
      btn.removeClass('selected');
      input.attr('disabled', null);
    }
  }
}

export function ImportControl(gui, opts) {
  var model = gui.model;
  var initialImport = true;
  var importCount = 0;
  var importTotal = 0;
  var overQuickView = false;
  var useQuickView = false;
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
  // new SimpleButton('#add-empty-btn').on('click', addEmptyLayer);
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

  function initDropArea(el, isQuick) {
    var area = El(el)
      .on('dragleave', onout)
      .on('dragover', function() {overQuickView = !!isQuick; onover();})
      .on('mouseover', onover)
      .on('mouseout', onout);

    function onover() {
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
      console.log(e);
      gui.alert(e.message, 'Import error');
    }
    if (gui.getMode() == 'import') {
      // Mode could also be 'alert' if an error is thrown and handled
      gui.clearMode();
    }
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
      if (internal.looksLikeContentFile(f.name) && f.name in index === false) {
        index[f.name] = true;
        memo.push(f);
      }
      return memo;
    }, []);
  }

  function showQueuedFiles() {
    var list = gui.container.findChild('.dropped-file-list').empty();
    queuedFiles.forEach(function(f) {
      var html = '<span>' + f.name + '</span><img class="close-btn" draggable="false" src="images/close.png">';
      var entry = El('<div>').html(html);
      entry.appendTo(list);
      // init delete button
      GUI.onClick(entry.findChild('img.close-btn'), function(e) {
        e.stopPropagation();
        queuedFiles = queuedFiles.filter(function(item) {
          return item != f;
        });
        if (queuedFiles.length > 0) {
          showQueuedFiles();
        } else {
          gui.clearMode();
        }
      });
    });
  }

  async function receiveFiles(files) {
    var names = getFileNames(files);
    var expanded = [];
    if (files.length === 0) return;
    useQuickView = importTotal === 0 && (opts.quick_view || overQuickView);
    try {
      expanded = await expandFiles(files);
    } catch(e) {
      console.log(e);
      gui.alert(e.message, 'Import error');
      return;
    }
    addFilesToQueue(expanded);
    if (queuedFiles.length === 0) {
      var msg = `Unable to import data from: ${names.join(', ')}`;
      gui.alert(msg, 'Import error');
      return;
    }
    gui.enterMode('import');
    if (useQuickView) {
      await importQueuedFiles();
    } else {
      gui.container.addClass('queued-files');
      El('#path-import-options').classed('hidden', !filesMayContainPaths(queuedFiles));
      showQueuedFiles();
    }
  }

  function getFileNames(files) {
    return Array.from(files).map(function(f) {return f.name;});
  }

  async function expandFiles(files) {
    var expanded = [], tmp;
    await wait(35); // pause a beat so status message can display
    for (var f of files) {
      var data = await readFileData(f);
      if (internal.isGzipFile(f.name)) {
        tmp = await readGzipFile(data);
      } else if (internal.isZipFile(f.name)) {
        tmp = await readZipFile(data);
      } else if (internal.isKmzFile(f.name)) {
        tmp = await readKmzFile(data);
      } else {
        tmp = [data];
      }
      expanded = expanded.concat(tmp);
    }
    files.length = 0; // clear source array for gc (works?)
    return expanded;
  }

  async function importFiles(fileData) {
    var importOpts = readImportOpts();
    var groups = groupFilesForImport(fileData, importOpts);
    var optStr = GUI.formatCommandOptions(importOpts);
    fileData = null;
    for (var group of groups) {
      if (group.size > 4e7) {
        gui.showProgressMessage('Importing');
        await wait(35);
      }
      if (group[internal.PACKAGE_EXT]) {
        await importSessionData(group[internal.PACKAGE_EXT].content, gui);
      } else if (importDataset(group, importOpts)) {
        importCount++;
        gui.session.fileImported(group.filename, optStr);
      }
    }
  }

  function importDataset(group, importOpts) {
    var dataset = internal.importContent(group, importOpts);
    if (datasetIsEmpty(dataset)) return false;
    if (group.layername) {
      dataset.layers.forEach(lyr => lyr.name = group.layername);
    }
    // save import options for use by repair control, etc.
    dataset.info.import_options = importOpts;
    model.addDataset(dataset);
    return true;
  }

  function addEmptyLayer() {
    var dataset = {
      layers: [{
        name: 'New layer',
        geometry_type: 'point',
        shapes: []
      }],
      info: {}
    };
    model.addDataset(dataset);
    gui.clearMode();
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

  function isShapefilePart(name) {
    return /\.(shp|shx|dbf|prj|cpg)$/i.test(name);
  }

  function readImportOpts() {
    var importOpts;
    if (useQuickView) {
      importOpts = {}; // default opts using quickview
    } else {
      var freeform = El('#import-options .advanced-options').node().value;
      importOpts = GUI.parseFreeformOptions(freeform, 'i');
    }
    return importOpts;
  }

  // @file a File object
  async function readContentFileAsync(file, cb) {
    var reader = new FileReader();
    reader.addEventListener('loadend', function(e) {
      if (!reader.result) {
        cb(new Error());
      } else {
        cb(null, reader.result);
      }
    });
    if (internal.isImportableAsBinary(file.name)) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
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
      // return GUI.isReadableFileType(item.basename) ? item : null;
      return internal.looksLikeImportableFile(item.basename) ? item : null;
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
    var err;
    fetch(item.url).then(resp => {
      if (resp.status != 200) {
        // e.g. 404 because a URL listed in the GUI query string does not exist
        throw Error();
      }
      return resp.blob();
    }).then(blob => {
      if (blob) {
        blob.name = item.basename;
        memo.push(blob);
      }
    }).catch(e => {
      err = "Error&nbsp;loading&nbsp;" + item.name + ". Possible causes include: wrong URL, no network connection, server not configured for cross-domain sharing (CORS).";
    }).finally(() => {
      next(err, memo);
    });
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function readKmzFile(file) {
    var files = await readZipFile(file);
    var name = files[0] && files[0].name;
    if (name == 'doc.kml') {
      files[0].name = internal.replaceFileExtension(file.name, 'kml');
    }
    return files;
  }

  async function readGzipFile(file) {
    var name = file.name.replace(/\.gz$/, '');
    await wait(35); // pause a beat so status message can display
    return [{
      name: name,
      content: internal.gunzipSync(file.content, name)
    }];
  }

  async function readZipFile(file) {
    // Async is up to twice as fast unzipping large files
    // var index = internal.unzipSync(file.content);
    var index = await utils.promisify(internal.unzipAsync)(file.content);
    return Object.keys(index).reduce(function(memo, filename) {
      if (!/\.txt$/i.test(filename)) {
        memo.push({
          name: filename,
          content: index[filename]
        });
      }
      return memo;
    }, []);
  }

  function fileSize(data) {
    return data.content.byteLength || data.content.length; // ArrayBuffer or string
  }

  function fileType(data) {
    return internal.guessInputType(data.name, data.content);
  }

  function key(basename, type) {
    return basename + '.' + type;
  }

  function fileBase(data) {
    return internal.getFileBase(data.name).toLowerCase();
  }

  function fileKey(data) {
    return key(fileBase(data), fileType(data));
  }

  async function readFileData(file) {
    try {
      var content = await utils.promisify(readContentFileAsync)(file);
      return {
        content: content,
        name: file.name
      };
    } catch (e) {
      console.error(e);
      throw Error(`Browser was unable to load the file ${file.name}`);
    }
  }

  function groupFilesForImport(data, importOpts) {
    var names = importOpts.name ? [importOpts.name] : null;
    if (initialImport && opts.name) { // name from mapshaper-gui --name option
      names = opts.name.split(',');
    }

    function hasShp(basename) {
      var shpKey = key(basename, 'shp');
      return data.some(d => fileKey(d) == shpKey);
    }

    data.forEach(d => {
      var basename = fileBase(d);
      var type = fileType(d);
      if (type == 'shp' || !isShapefilePart(d.name)) {
        d.group = key(basename, type);
        d.filename = d.name;
      } else if (hasShp(basename)) {
        d.group = key(basename, 'shp');
      } else if (type == 'dbf') {
        d.filename = d.name;
        d.group = key(basename, 'dbf');
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
      g.size = (g.size || 0) + fileSize(d); // accumulate size
      g[fileType(d)] = {
        filename: d.name,
        content: d.content
      };
      // kludge: stash import name for session history
      if (d.filename) g.filename = d.filename;
    });
    return groups;
  }
}
