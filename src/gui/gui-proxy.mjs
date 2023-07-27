import { saveZipFile, saveFilesToServer, saveBlobToLocalFile } from './gui-save';
import { internal, utils, cli, stop } from './gui-core';
import { GUI } from './gui-lib';

// replace default error, stop and message functions
export function setLoggingForGUI(gui) {
  function stop() {
    // Show a popup error message, then throw an error
    var msg = GUI.formatMessageArgs(arguments);
    gui.alert(msg);
    throw new Error(msg);
  }

  function error() {
    stop.apply(null, utils.toArray(arguments));
  }

  function message() {
    var msg = GUI.formatMessageArgs(arguments);
    gui.message(msg);
    internal.logArgs(arguments);
  }

  internal.setLoggingFunctions(message, error, stop);
}

export function WriteFilesProxy(gui) {
  // replace CLI version of writeFiles()
  internal.replaceWriteFiles(function(files, opts, done) {
    var filename;
    if (!utils.isArray(files) || files.length === 0) {
      done("Nothing to export");
    } else if (GUI.canSaveToServer() && !opts.save_to_download_folder) {
      var paths = internal.getOutputPaths(utils.pluck(files, 'filename'), opts);
      var data = utils.pluck(files, 'content');
      saveFilesToServer(paths, data, function(err) {
        var msg;
        if (err) {
          msg = "<b>Direct save failed</b><br>Reason: " + err + ".";
          msg += "<br>Saving to download folder instead.";
          gui.alert(msg);
          // fall back to standard method if saving to server fails
          internal.writeFiles(files, {save_to_download_folder: true}, done);
        } else {
          if (files.length >= 1) {
            gui.alert('<b>Saved</b><br>' + paths.join('<br>'));
          }
          done();
        }
      });
    } else if (files.length == 1) {
      saveBlobToLocalFile(files[0].filename, new Blob([files[0].content]), done);
    } else {
      filename = internal.getCommonFileBase(utils.pluck(files, 'filename')) || "output";
      saveZipFile(filename + ".zip", files, done);
    }
  });
}

// Replaces functions for reading from files with functions that try to match
// already-loaded datasets.
//
export function ImportFileProxy(gui) {
  var model = gui.model;

  // Try to match an imported dataset or layer.
  // TODO: think about handling import options
  function find(src) {
    var datasets = model.getDatasets();
    var retn = datasets.reduce(function(memo, d) {
      var lyr;
      if (memo) return memo; // already found a match
      // try to match import filename of this dataset
      if (d.info.input_files[0] == src) return d;
      // try to match name of a layer in this dataset
      lyr = utils.find(d.layers, function(lyr) {return lyr.name == src;});
      return lyr ? internal.isolateLayer(lyr, d) : null;
    }, null);
    if (!retn) stop("Missing data layer [" + src + "]");
    return retn;
  }

  internal.replaceImportFile(function(src, opts) {
    var dataset = find(src);
    // Return a copy with layers duplicated, so changes won't affect original layers
    // This makes an (unsafe) assumption that the dataset arcs won't be changed...
    // need to rethink this.
    return utils.defaults({
      layers: dataset.layers.map(internal.copyLayer)
    }, dataset);
  });
}

internal.setProjectionLoader(loadProjLibs);

// load Proj.4 CRS definition files dynamically
//
async function loadProjLibs(opts) {
  var mproj = require('mproj');
  var libs = internal.findProjLibs([opts.init || '', opts.match || '', opts.crs || ''].join(' '));
  libs = libs.filter(function(name) {return !mproj.internal.mproj_search_libcache(name);}); // skip loaded libs
  for (var libName of libs) {
    var content = await fetch('assets/' + libName).then(resp => resp.ok ? resp.text() : null);
    if (!content) stop(`Unable to load projection resource [${libName}]`);
    mproj.internal.mproj_insert_libcache(libName, content);
  }
}
