import { CatalogControl } from './gui-catalog-control';
import { utils, internal, stop } from './gui-core';
import { El } from './gui-el';
import { SimpleButton } from './gui-elements';
import { GUI } from './gui-lib';
import { setLayerPinning } from './gui-layer-utils';
import { importSessionData } from './gui-session-snapshot-control';
import { openAddLayerPopup } from './gui-add-layer-popup';
import { considerReprojecting, loadGeopackageLib, getGeoPackageFeatureTables } from './gui-import-utils';

// @cb function(<FileList>)
function DropControl(gui, el, cb) {
  var area = El(el);
  // blocking drag events enables drop event
  area.on('dragleave', block)
      .on('dragover', block)
      .on('drop', ondrop)
      .on('paste', onpaste);
  area.node().addEventListener('paste', onpaste);
  // TODO: use same function for drop and paste
  function ondrop(e) {
    var files = e.dataTransfer.files;
    var types = e.dataTransfer.types;
    block(e);
    if (files.length) {
      cb(files);
    } else if (types.includes('text/uri-list')) {
      cb(e.dataTransfer.getData('text/uri-list').split(','));
    } else if (types.includes('text/html')) {
      // drag-dropping a highlighted link may pull in a chunk of html
      var urls = pastedHtmlToUrls(e.dataTransfer.getData('text/html'));
      if (urls.length) {
        cb(urls);
      }
    }
  }
  function onpaste(e) {
    var types = Array.from(e.clipboardData.types || []).join(',');
    var items = Array.from(e.clipboardData.items || []);
    var files, str, urls;
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

    // import text from the clipboard (could be csv, json, a url, etc)
    // formatted text can be available as both text/plain and text/html (e.g.
    //   a JSON data object copied from a GitHub issue).
    //

    // if html is present, it could be data (e.g. from Google Sheets) or a pasted link.
    // first we check for a link
    if (types.includes('text/html')) {
      urls = pastedHtmlToUrls(e.clipboardData.getData('text/html'));
      if (urls.length) {
        return cb(urls);
      }
    }
    if (types.includes('text/plain')) {
      // text from clipboard (supported by Chrome, FF, Safari)
      // TODO: handle FF case of string containing multiple file names.
      str = e.clipboardData.getData('text/plain');
      urls = pastedTextToUrls(str);
      if (urls.length) {
        return cb(urls);
      }
      files = [pastedTextToFile(str)];
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

function pastedHtmlToUrls(html) {
  var hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  var matches = html.matchAll(hrefRegex);
  var urls = Array.from(matches, match => match[1]);
  return urls;
}

function pastedTextToUrls(str) {
  if (!looksLikeUrl(str)) return [];
  var regex = /https?:\/\/[^\s]+?(?=[\s,]|$)/g;
  var matches = str.matchAll(regex);
  var urls = Array.from(matches, match => match[0]);
  return urls;
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

function looksLikeUrl(str) {
  return /^https?:\/\//.test(str);
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
  var useQuickView = false;
  var queuedFiles = [];
  var gpkgLayerEntries = [];
  var gpkgSelectAllBtn = null;
  var gpkgListRequestId = 0;
  var gpkgListPending = false;
  var manifestFiles = opts.files || [];
  var catalog;

  if (opts.catalog) {
    catalog = new CatalogControl(gui, opts.catalog, downloadFiles);
  }

  var submitBtn = new SimpleButton('#import-options .submit-btn').on('click', importQueuedFiles);
  new SimpleButton('#import-options .cancel-btn').on('click', gui.clearMode);
  new DropControl(gui, 'body', receiveDroppedItems);
  new FileChooser('#import-options .add-btn', receiveFilesWithOption);
  new FileChooser('#add-file-btn', receiveFiles);
  new SimpleButton('#add-empty-btn').on('click', function() {
    gui.clearMode(); // close import dialog
    openAddLayerPopup(gui);
  });
  // initDropArea('#import-quick-drop', true);
  // initDropArea('#import-drop');
  gui.keyboard.onMenuSubmit(El('#import-options'), importQueuedFiles);

  gui.addMode('import', turnOn, turnOff);
  gui.enterMode('import');

  function turnOn() {
    if (manifestFiles.length > 0) {
      downloadFiles(manifestFiles);
      manifestFiles = [];
    } else if (model.isEmpty()) {
      showImportMenu();
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
    hideImportMenu();
  }

  async function importQueuedFiles() {
    // gui.container.removeClass('queued-files');
    hideImportMenu();
    var files = queuedFiles;
    try {
      if (files.length > 0) {
        queuedFiles = [];
        await importFiles(files, readImportOpts());
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
    if (opts.display_all && importTotal === 0) {
      model.getLayers().forEach(function(o) {
        setLayerPinning(o.layer, true);
      });
    }
    model.updated({select: true}); // trigger redraw
  }

  function clearQueuedFiles() {
    queuedFiles = [];
    clearGeoPackageLayerSelectionMenu();
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
          updateGeoPackageLayerSelectionMenu();
        } else {
          gui.clearMode();
        }
      });
    });
    updateImportSubmitState();
  }

  function receiveDroppedItems(arr) {
    if (utils.isString(arr[0])) { // assume array of URLs
      downloadFiles(arr);
    } else { // assume array of Files
      receiveFilesWithOption(arr);
    }
  }

  function receiveFilesWithOption(files) {
    var quickView = !El('.advanced-import-options').node().checked;
    receiveFiles(files, quickView);
  }

  async function receiveFiles(files, quickView) {
    var names = getFileNames(files);
    var expanded = [];
    if (files.length === 0) return;
    useQuickView = importTotal === 0 && (opts.quick_view ||
        quickView);
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
      showImportMenu();
    }
  }

  function showImportMenu() {
    // gui.container.addClass('queued-files');
    El('#import-options').show();
    gui.container.classed('queued-files', queuedFiles.length > 0);
    El('#path-import-options').classed('hidden', !filesMayContainPaths(queuedFiles));
    showQueuedFiles();
    updateGeoPackageLayerSelectionMenu();
  }

  function hideImportMenu() {
    // gui.container.removeClass('queued-files');
    El('#import-options').hide();
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

  async function importFiles(fileData, importOpts) {
    var groups = groupFilesForImport(fileData, importOpts);
    var optStr = GUI.formatCommandOptions(importOpts);
    fileData = null;
    for (var group of groups) {
      var groupImportOpts = getGroupImportOpts(group, importOpts);
      if (group.size > 4e7) {
        gui.showProgressMessage('Importing');
        await wait(35);
      }
      if (group[internal.PACKAGE_EXT]) {
        var fullRestore = await importSessionData(group[internal.PACKAGE_EXT].content, gui);
        importCount++;
        // Skip recording an -i command if the .msx import was a full project
        // restore: the previous session's history (including the original -i)
        // has already been reinstated, so adding another entry here would be
        // misleading. For the merge case, record the import as a regular -i
        // so the snapshot contributes a CLI-replayable entry to the session.
        if (!fullRestore) {
          gui.session.fileImported(group[internal.PACKAGE_EXT].filename, optStr);
        }
      } else if (await importDataset(group, groupImportOpts)) {
        importCount++;
        gui.session.fileImported(group.filename, optStr);
      }
    }
  }

  async function importDataset(group, importOpts) {
    var dataset;
    var datasets;
    var imported = false;
    if (group.gpkg) {
      await loadGeopackageLib();
    }
    if (group.gpkg || group.fgb) {
      dataset = await internal.importContentAsync(group, importOpts);
    } else {
      dataset = internal.importContent(group, importOpts);
    }
    datasets = Array.isArray(dataset) ? dataset : [dataset];
    for (var d of datasets) {
      if (datasetIsEmpty(d)) continue;
      if (group.layername) {
        d.layers.forEach(lyr => lyr.name = group.layername);
      }
      // TODO: add popup here
      // save import options for use by repair control, etc.
      d.info.import_options = importOpts;
      try {
        await considerReprojecting(gui, d, importOpts);
      } catch(e) {
        gui.alert(e.message, 'Projection error');
        return false;
      }
      model.addDataset(d);
      imported = true;
    }
    return imported;
  }



  function filesMayContainPaths(files) {
    return utils.some(files, function(f) {
        var type = internal.guessInputFileType(f.name);
        return type == 'shp' || type == 'json' || type == 'gpkg' || internal.isZipFile(f.name);
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

  function getGroupImportOpts(group, importOpts) {
    var layersByFile, filename, selected;
    if (!group.gpkg) return importOpts;
    layersByFile = getSelectedGeoPackageLayersByFile();
    filename = group.gpkg.filename;
    selected = layersByFile[filename];
    if (!selected || selected.length === 0) return importOpts;
    return Object.assign({}, importOpts, {
      gpkg_layers: selected
    });
  }

  function clearGeoPackageLayerSelectionMenu() {
    gpkgLayerEntries = [];
    gpkgSelectAllBtn = null;
    gpkgListPending = false;
    var container = El('#gpkg-import-options');
    if (!container.node()) return;
    container.addClass('hidden');
    container.findChild('.gpkg-layer-list').empty();
  }

  function getQueuedGeoPackageFiles() {
    return queuedFiles.filter(function(file) {
      return internal.guessInputFileType(file.name) == 'gpkg';
    });
  }

  async function updateGeoPackageLayerSelectionMenu() {
    var gpkgFiles = getQueuedGeoPackageFiles();
    var requestId = ++gpkgListRequestId;
    clearGeoPackageLayerSelectionMenu();
    if (useQuickView || gpkgFiles.length === 0) {
      updateImportSubmitState();
      return;
    }
    gpkgListPending = true;
    updateImportSubmitState();
    try {
      var tablesByFile = await Promise.all(gpkgFiles.map(async function(file) {
        return {
          file: file,
          tables: await getGeoPackageFeatureTables(file.content)
        };
      }));
      if (requestId != gpkgListRequestId) return;
      renderGeoPackageLayerSelectionMenu(tablesByFile);
    } catch (e) {
      console.error(e);
      if (requestId == gpkgListRequestId) {
        clearGeoPackageLayerSelectionMenu();
        gui.alert(e.message || 'Unable to read GeoPackage layers', 'Import error');
      }
    } finally {
      if (requestId == gpkgListRequestId) {
        gpkgListPending = false;
        updateImportSubmitState();
      }
    }
  }

  function renderGeoPackageLayerSelectionMenu(tablesByFile) {
    var container = El('#gpkg-import-options');
    var list = container.findChild('.gpkg-layer-list').empty();
    gpkgLayerEntries = [];
    gpkgSelectAllBtn = null;
    tablesByFile.forEach(function(item) {
      var filename = item.file.name;
      var tables = item.tables || [];
      if (tables.length === 0) return;
      tables.forEach(function(tableName) {
        var label = El('label').addClass('gpkg-layer-item');
        var box = El('input')
          .attr('type', 'checkbox')
          .attr('data-gpkg-file', filename)
          .attr('data-gpkg-layer', tableName)
          .node();
        box.checked = true;
        box.addEventListener('click', updateGeoPackageSelectAllToggle);
        label.appendChild(box);
        label.appendChild(El('span').text(' ' + tableName));
        list.appendChild(label);
        var entry = {
          filename: filename,
          layer: tableName,
          checkbox: box
        };
        gpkgLayerEntries.push(entry);
      });
    });
    if (gpkgLayerEntries.length === 0) {
      container.addClass('hidden');
      return;
    }
    if (gpkgLayerEntries.length > 1) {
      list.node().insertBefore(initGeoPackageSelectAllToggle().node(), list.node().firstChild);
    }
    container.removeClass('hidden');
    updateGeoPackageSelectAllToggle();
  }

  function initGeoPackageSelectAllToggle() {
    var toggle = El('label').addClass('gpkg-layer-item');
    var btn = El('input')
      .attr('type', 'checkbox')
      .attr('value', 'toggle')
      .node();
    btn.checked = true;
    btn.addEventListener('click', function() {
      var state = getGeoPackageSelectionState();
      setGeoPackageLayerSelection(state != 'all');
      updateGeoPackageSelectAllToggle();
    });
    toggle.appendChild(btn);
    toggle.appendChild(El('span').text(' Select all'));
    gpkgSelectAllBtn = btn;
    return toggle;
  }

  function setGeoPackageLayerSelection(checked) {
    gpkgLayerEntries.forEach(function(entry) {
      entry.checkbox.checked = !!checked;
    });
  }

  function getGeoPackageSelectionState() {
    var count = getSelectedGeoPackageLayerCount();
    if (gpkgLayerEntries.length > 0 && count == gpkgLayerEntries.length) return 'all';
    if (count === 0) return 'none';
    return 'some';
  }

  function getSelectedGeoPackageLayerCount() {
    return gpkgLayerEntries.reduce(function(memo, entry) {
      return memo + (entry.checkbox.checked ? 1 : 0);
    }, 0);
  }

  function getSelectedGeoPackageLayersByFile() {
    return gpkgLayerEntries.reduce(function(memo, entry) {
      if (!entry.checkbox.checked) return memo;
      if (!memo[entry.filename]) memo[entry.filename] = [];
      memo[entry.filename].push(entry.layer);
      return memo;
    }, {});
  }

  function updateGeoPackageSelectAllToggle() {
    if (gpkgSelectAllBtn) {
      gpkgSelectAllBtn.checked = getGeoPackageSelectionState() == 'all';
    }
    updateImportSubmitState();
  }

  function updateImportSubmitState() {
    var disabled = queuedFiles.length === 0 ||
      gpkgListPending ||
      (gpkgLayerEntries.length > 0 && getSelectedGeoPackageLayerCount() === 0);
    submitBtn.classed('disabled', disabled);
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
      var item = {name: name};
      if (looksLikeUrl(name)) {
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

  // Group multiple files belonging to the same dataset together
  // (applies to Shapefiles)
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
