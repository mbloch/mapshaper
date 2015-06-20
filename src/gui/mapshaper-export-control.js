/* @requires mapshaper-export */

// Export buttons and their behavior
//
var ExportControl = function() {
  var downloadSupport = typeof URL != 'undefined' && URL.createObjectURL &&
    typeof document.createElement("a").download != "undefined" ||
    !!window.navigator.msSaveBlob;
  var dataset, anchor, blobUrl;

  El('#g-export-control').show();

  if (!downloadSupport) {
    El('#g-export-control .g-label').text("Exporting is not supported in this browser");
  } else {
    anchor = El('#g-export-control').newChild('a').attr('href', '#').node();
    El('#g-export-buttons').css('display:inline');
    exportButton("#g-geojson-btn", "geojson");
    shpBtn = exportButton("#g-shapefile-btn", "shapefile");
    topoBtn = exportButton("#g-topojson-btn", "topojson");
  }

  this.setDataset = function(d) {
    dataset = d;
    return this;
  };

  function exportButton(selector, format) {
    var btn = new SimpleButton(selector).active(true).on('click', onClick);
    function onClick(e) {
      btn.active(false);
      setTimeout(function() {
        exportAs(format, function(err) {
          btn.active(true);
          if (err) error(err);
        });
      }, 10);
    }
  }

  function exportAs(format, done) {
    var opts = {format: format}, // TODO: implement other export opts
        files;

    try {
      files = MapShaper.exportFileContent(dataset, opts);
    } catch(e) {
      return done(e.message);
    }

    if (!utils.isArray(files) || files.length === 0) {
      done("Nothing to export");
    } else if (files.length == 1) {
      saveBlob(files[0].filename, new Blob([files[0].content]), done);
    } else {
      name = MapShaper.getCommonFileBase(utils.pluck(files, 'filename')) || "out";
      saveZipFile(name + ".zip", files, done);
    }
  }

  function saveBlob(filename, blob, done) {
    if (window.navigator.msSaveBlob) {
      window.navigator.msSaveBlob(blob, filename);
      done();
    }
    try {
      // revoke previous download url, if any. TODO: do this when download completes (how?)
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob);
    } catch(e) {
      done("Mapshaper can't export files from this browser. Try switching to Chrome or Firefox.");
      return;
    }

    // TODO: handle errors
    anchor.href = blobUrl;
    anchor.download = filename;
    var clickEvent = document.createEvent("MouseEvent");
    clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false,
        false, false, false, 0, null);
    anchor.dispatchEvent(clickEvent);
    done();
  }

  function saveZipFile(zipfileName, files, done) {
    var toAdd = files;
    try {
      zip.createWriter(new zip.BlobWriter("application/zip"), addFile, zipError);
    } catch(e) {
      // TODO: show proper error message, not alert
      done("This browser doesn't support Zip file creation.");
    }

    function zipError(msg) {
      var str = "Error creating Zip file";
      if (msg) {
        str += ": " + (msg.message || msg);
      }
      done(str);
    }

    function addFile(archive) {
      if (toAdd.length === 0) {
        archive.close(function(blob) {
          saveBlob(zipfileName, blob, done);
        });
      } else {
        var obj = toAdd.pop(),
            blob = new Blob([obj.content]);
        archive.add(obj.filename, new zip.BlobReader(blob), function() {addFile(archive);});
      }
    }
  }
};
