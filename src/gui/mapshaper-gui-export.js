/* @requires mapshaper-gui-lib */

gui.exportIsSupported = function() {
  return typeof URL != 'undefined' && URL.createObjectURL &&
    typeof document.createElement("a").download != "undefined" ||
    !!window.navigator.msSaveBlob;
};

// replaces function from mapshaper.js
MapShaper.writeFiles = function(files, opts, done) {
  var filename;
  if (!utils.isArray(files) || files.length === 0) {
    done("Nothing to export");
  } else if (files.length == 1) {
    saveBlob(files[0].filename, new Blob([files[0].content]), done);
  } else {
    filename = utils.getCommonFileBase(utils.pluck(files, 'filename')) || "output";
    saveZipFile(filename + ".zip", files, done);
  }
};

function isMultiLayerFormat(fmt) {
  return fmt == 'svg' || fmt == 'topojson';
}

gui.exportDatasets = function(datasets, opts) {
  var files;
  if (isMultiLayerFormat(opts.format)) {
    // merge multiple datasets into one for export as SVG or TopoJSON
    if (datasets.length > 1) {
      datasets = [MapShaper.mergeDatasetsForExport(datasets)];
      if (opts.format == 'topojson') {
        // Build topology, in case user has loaded several
        // files derived from the same source, with matching coordinates
        // (Downsides: useless work if geometry is unrelated;
        // could create many small arcs if layers are partially related)
        api.buildTopology(datasets[0]);
      }
      // KLUDGE let exporter know that copying is not needed
      // (because shape data was deep-copied during merge)
      opts.final = true;
    }
  } else {
    MapShaper.assignUniqueLayerNames2(datasets);
  }
  files = datasets.reduce(function(memo, dataset) {
    var output = MapShaper.exportFileContent(dataset, opts);
    return memo.concat(output);
  }, []);
  // multiple output files will be zipped, need unique names
  MapShaper.assignUniqueFileNames(files);
  return files;
};

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

function saveBlob(filename, blob, done) {
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
