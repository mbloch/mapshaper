import { El } from './gui-el';

export function saveZipFile(zipfileName, files, done) {
  var zip = window.zip; // assumes zip library is loaded globally
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

  function zipError(err) {
    var str = "Error creating Zip file";
    var msg = '';
    // error events thrown by Zip library seem to be missing a message
    if (err && err.message) {
      msg = err.message;
    }
    if (msg) {
      str += ": " + msg;
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

export function saveBlobToDownloadFolder(filename, blob, done) {
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
