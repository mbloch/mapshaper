/* @requires mapshaper-gui-lib */

gui.exportIsSupported = function() {
  return typeof URL != 'undefined' && URL.createObjectURL &&
    typeof document.createElement("a").download != "undefined" ||
    !!window.navigator.msSaveBlob;
};

function canSaveToServer() {
  return !!(mapshaper.manifest && mapshaper.manifest.allow_saving) && typeof fetch == 'function';
}

// replaces function from mapshaper.js
internal.writeFiles = function(files, opts, done) {
  var filename;
  if (!utils.isArray(files) || files.length === 0) {
    done("Nothing to export");
  } else if (canSaveToServer() && !opts.save_to_download_folder) {
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

function saveZipFile(zipfileName, files, done) {
  var toAdd = files;
  var zipWriter;
  try {
    zip.createWriter(new zip.BlobWriter("application/zip"), function(writer) {
      zipWriter = writer;
      nextFile();
    }, zipError);
  } catch(e) {
    done("This browser doesn't support Zip file creation.");
  }

  function zipError(msg) {
    var str = "Error creating Zip file";
    if (msg) {
      str += ": " + (msg.message || msg);
    }
    done(str);
  }

  function nextFile() {
    if (toAdd.length === 0) {
      zipWriter.close(function(blob) {
        saveBlobToDownloadFolder(zipfileName, blob, done);
      });
    } else {
      var obj = toAdd.pop(),
          blob = new Blob([obj.content]);
      zipWriter.add(obj.filename, new zip.BlobReader(blob), nextFile);
    }
  }
}

function saveFilesToServer(exports, opts, done) {
  var paths = internal.getOutputPaths(utils.pluck(exports, 'filename'), opts);
  var data = utils.pluck(exports, 'content');
  var i = -1;
  next();
  function next(err) {
    i++;
    if (err) return done(err);
    if (i >= exports.length) {
      gui.alert('<b>Saved</b><br>' + paths.join('<br>'));
      return done();
    }
    saveBlobToServer(paths[i], new Blob([data[i]]), next);
  }
}

function saveBlobToServer(path, blob, done) {
  var q = '?file=' + encodeURIComponent(path);
  var url = window.location.origin + '/save' + q;
  fetch(url, {
    method: 'POST',
    credentials: 'include',
    body: blob
  }).then(function(resp) {
    if (resp.status == 400) {
      return resp.text();
    }
  }).then(function(err) {
    done(err);
  }).catch(function(resp) {
    done('connection to server was lost');
  });
}

function saveBlobToDownloadFolder(filename, blob, done) {
  var anchor, blobUrl;
  if (window.navigator.msSaveBlob) {
    window.navigator.msSaveBlob(blob, filename);
    return done();
  }
  try {
    blobUrl = URL.createObjectURL(blob);
  } catch(e) {
    done("Mapshaper can't export files from this browser. Try switching to Chrome or Firefox.");
    return;
  }
  anchor = El('a').attr('href', '#').appendTo('body').node();
  anchor.href = blobUrl;
  anchor.download = filename;
  var clickEvent = document.createEvent("MouseEvent");
  clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false,
      false, false, false, 0, null);
  anchor.dispatchEvent(clickEvent);
  setTimeout(function() {
    // Revoke blob url to release memory; timeout needed in firefox
    URL.revokeObjectURL(blobUrl);
    anchor.parentNode.removeChild(anchor);
    done();
  }, 400);
}
