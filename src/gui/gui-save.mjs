import { El } from './gui-el';
import { GUI } from './gui-lib';
import { internal } from './gui-core';
import { showPopupAlert } from './gui-alert';

export function saveZipFile(zipfileName, files, done) {
  internal.zipAsync(files, function(err, buf) {
    if (err) {
      done(errorMessage(err));
    } else {
      saveBlobToLocalFile(zipfileName, new Blob([buf]), done);
    }
  });

  function errorMessage(err) {
    var str = "Error creating Zip file";
    if (err.message) {
      str += ": " + err.message;
    }
    return str;
  }
}

export function saveFilesToServer(paths, data, done) {
  var i = -1;
  next();
  function next(err) {
    i++;
    if (err) return done(err);
    if (i >= data.length) return done();
    saveBlobToServer(paths[i], new Blob([data[i]]), next);
  }
}

function saveBlobToServer(path, blob, done) {
  var q = '?file=' + encodeURIComponent(path);
  var url = window.location.origin + '/save' + q;
  window.fetch(url, {
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

export async function saveBlobToLocalFile(filename, blob, done) {
  var chooseDir = GUI.getSavedValue('choose-save-dir');
  done = done || function() {};
  if (chooseDir) {
    saveBlobToSelectedFile(filename, blob, done);
  } else {
    saveBlobToDownloadsFolder(filename, blob, done);
  }
}

function showSaveDialog(filename, blob, done) {
  var alert = showPopupAlert(`Save ${filename} to:`)
    .button('selected folder', function() {
      saveBlobToSelectedFile(filename, blob, done);
    })
    .button('downloads', function() {
      saveBlobToDownloadsFolder(filename, blob, done);
    })
    .onCancel(done);
}

export async function saveBlobToSelectedFile(filename, blob, done) {
  // see: https://developer.chrome.com/articles/file-system-access/
  // note: saving multiple files to a directory using showDirectoryPicker()
  //   does not work well (in Chrome). User is prompted for permission each time,
  //   and some directories (like Downloads and Documents) are blocked.
  //
  var options = getSaveFileOptions(filename);
  var handle;
  try {
    handle = await window.showSaveFilePicker(options);
    var writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch(e) {
    if (e.name == 'SecurityError') {
      // assuming this is a timeout error, with message like:
      // "Must be handling a user gesture to show a file picker."
      showSaveDialog(filename, blob, done);
    } else if (e.name == 'AbortError') {
      // fired if user clicks a cancel button (normal, no error message)
      // BUT: this kind of erro rmay also get fired when saving to a protected folder
      //   (should show error message)
      done();
    } else {
      console.error(e.name, e.message, e);
      done('Save failed for an unknown reason');
    }
    return;
  }

  done();
}

function getSaveFileOptions(filename) {
  // see: https://wicg.github.io/file-system-access/#api-filepickeroptions
  var type = internal.guessInputFileType(filename);
  var ext = internal.getFileExtension(filename).toLowerCase();
  var accept = {};
  if (ext == 'kml') {
    accept['application/vnd.google-earth.kml+xml'] = ['.kml'];
  } else if (ext == 'svg') {
    accept['image/svg+xml'] = ['.svg'];
  } else if (ext == 'zip') {
    accept['application/zip'] == ['.zip'];
  } else if (type == 'text') {
    accept['text/csv'] = ['.csv', '.tsv', '.tab', '.txt'];
  } else if (type == 'json') {
    accept['application/json'] = ['.json', '.geojson', '.topojson'];
  } else {
    accept['application/octet-stream'] = ['.' + ext];
  }
  return {
    suggestedName: filename,
    // If startIn is given, Chrome will always start there
    // Default is to start in the previously selected dir (better)
    // // startIn: 'downloads', // or: desktop, documents, [file handle], [directory handle]
    types: [{
      description: 'Files',
      accept: accept
    }]
  };
}


function saveBlobToDownloadsFolder(filename, blob, done) {
  var anchor, blobUrl;
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
