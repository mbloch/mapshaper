/* @require gui-lib */

// These functions could be called when validating i/o options; TODO: avoid this
cli.isFile =
cli.isDirectory = function(name) {return false;};
cli.validateOutputDir = function() {};

function MessageProxy(gui) {
  // Replace error function in mapshaper lib
  error = internal.error = function() {
    stop.apply(null, utils.toArray(arguments));
  };

  // replace stop function
  stop = internal.stop = function() {
    // Show a popup error message, then throw an error
    var msg = GUI.formatMessageArgs(arguments);
    gui.alert(msg);
    throw new Error(msg);
  };

  message = internal.message = function() {
    internal.logArgs(arguments); // reset default
  };
}

function WriteFilesProxy(gui) {
  // replaces function from mapshaper.js
  internal.writeFiles = function(files, opts, done) {
    var filename;
    if (!utils.isArray(files) || files.length === 0) {
      done("Nothing to export");
    } else if (GUI.canSaveToServer() && !opts.save_to_download_folder) {
      saveFilesToServer(files, opts, function(err) {
        var msg;
        if (err) {
          msg = "<b>Direct save failed</b><br>Reason: " + err + ".";
          msg += "<br>Saving to download folder instead.";
          gui.alert(msg);
          // fall back to standard method if saving to server fails
          internal.writeFiles(files, {save_to_download_folder: true}, done);
        } else {
          done();
        }
      });
    } else if (files.length == 1) {
      saveBlobToDownloadFolder(files[0].filename, new Blob([files[0].content]), done);
    } else {
      filename = utils.getCommonFileBase(utils.pluck(files, 'filename')) || "output";
      saveZipFile(filename + ".zip", files, done);
    }
  };
}

// Replaces functions for reading from files with functions that try to match
// already-loaded datasets.
//
function ImportFileProxy(gui) {
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

  api.importFile = function(src, opts) {
    var dataset = find(src);
    // Aeturn a copy with layers duplicated, so changes won't affect original layers
    // This makes an (unsafe) assumption that the dataset arcs won't be changed...
    // need to rethink this.
    return utils.defaults({
      layers: dataset.layers.map(internal.copyLayer)
    }, dataset);
  };
}

// load Proj.4 CRS definition files dynamically
//
internal.initProjLibrary = function(opts, done) {
  var mproj = require('mproj');
  var libs = internal.findProjLibs([opts.from || '', opts.match || '', opts.crs || ''].join(' '));
  // skip loaded libs
  libs = libs.filter(function(name) {return !mproj.internal.mproj_search_libcache(name);});
  loadProjLibs(libs, done);
};

function loadProjLibs(libs, done) {
  var mproj = require('mproj');
  var i = 0;
  next();

  function next() {
    var libName = libs[i];
    var content, req;
    if (!libName) return done();
    req = new XMLHttpRequest();
    req.addEventListener('load', function(e) {
      if (req.status == 200) {
        content = req.response;
      }
    });
    req.addEventListener('loadend', function() {
      if (content) {
        mproj.internal.mproj_insert_libcache(libName, content);
      }
      // TODO: consider stopping with an error message if no content was loaded
      // (currently, a less specific error will occur when mapshaper tries to use the library)
      next();
    });
    req.open('GET', 'assets/' + libName);
    req.send();
    i++;
  }
}
