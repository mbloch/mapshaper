/* @requires mapshaper-gui-lib mapshaper-mode-button mapshaper-gui-options */

// Export buttons and their behavior
var ExportControl = function(model) {
  var downloadSupport = typeof URL != 'undefined' && URL.createObjectURL &&
    typeof document.createElement("a").download != "undefined" ||
    !!window.navigator.msSaveBlob;
  var unsupportedMsg = "Exporting is not supported in this browser";
  var menu = El('#export-options').on('click', gui.handleDirectEvent(model.clearMode));
  var anchor, blobUrl;

  if (!downloadSupport) {
    El('#export-btn').on('click', function() {
      gui.alert(unsupportedMsg);
    });

    MapShaper.writeFiles = function() {
      error(unsupportedMsg);
    };
  } else {
    anchor = menu.newChild('a').attr('href', '#').node();
    initExportButton();
    model.addMode('export', turnOn, turnOff);
    new ModeButton('#export-btn', 'export', model);

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
  }

  function initLayerMenu() {
    // init layer menu with current editing layer selected
    var list = El('#export-layer-list').empty();
    var selected = model.getEditingLayer().layer;
    var template = '<label><input type="checkbox"> %s</label>';
    var datasets = model.getDatasets().map(initDataset);

    function initDataset(dataset) {
      var layers = dataset.layers.map(function(lyr) {
        var html = utils.format(template, lyr.name || '[unnamed layer]');
        var box = El('div').html(html).appendTo(list).findChild('input').node();
        if (lyr === selected) box.checked = true;
        return {
          checkbox: box,
          layer: lyr
        };
      });
      return {
        dataset: dataset,
        layers: layers
      };
    }
  }

  function initFormatMenu() {
    var fmt = MapShaper.getOutputFormat(model.getEditingLayer().dataset, {});
    var btn = El('#export-formats input[value="' + fmt + '"]').node();
    if (btn) btn.checked = true;

  }

  function turnOn() {
    initLayerMenu();
    initFormatMenu();
    menu.show();
  }

  function turnOff() {
    menu.hide();
  }

  function getSelectedFormat() {
    return El('#export-formats input:checked').node().value;
  }

  function initExportButton() {
    new SimpleButton('#save-btn').on('click', function() {
      gui.showProgressMessage('Exporting');
      model.clearMode();
      setTimeout(function() {
        var fmt = getSelectedFormat();
        exportAs(fmt, function(err) {
          // hide message after a delay, so it doesn't just flash for an instant.
          setTimeout(gui.clearProgressMessage, err ? 0 : 400);
          if (err) {
            console.error(err);
            gui.alert(utils.isString(err) ? err : "Export failed for an unknown reason");
          }
        });
      }, 20);
    });
  }

  // @done function(string|Error|null)
  function exportAs(format, done) {
    var dataset, opts, files;
    try {
      dataset = utils.extend({}, model.getEditingLayer().dataset);
      opts = gui.parseFreeformOptions(El('#export-options .advanced-options').node().value, 'o');
      opts.format = format;
      if (opts.target) {
        dataset.layers = MapShaper.findMatchingLayers(dataset.layers, opts.target) ||
          stop("Unknown export target:", opts.target);
      }
      files = MapShaper.exportFileContent(dataset, opts);
    } catch(e) {
      return done(e);
    }

    MapShaper.writeFiles(files, opts, done);
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
