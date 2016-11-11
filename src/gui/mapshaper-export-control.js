/* @requires mapshaper-gui-lib mapshaper-mode-button mapshaper-gui-options */

// Export buttons and their behavior
var ExportControl = function(model) {
  var downloadSupport = typeof URL != 'undefined' && URL.createObjectURL &&
    typeof document.createElement("a").download != "undefined" ||
    !!window.navigator.msSaveBlob;
  var unsupportedMsg = "Exporting is not supported in this browser";
  var menu = El('#export-options').on('click', gui.handleDirectEvent(model.clearMode));
  var datasets = []; // array of exportable layers grouped by dataset
  var anchor, blobUrl;
  new SimpleButton('#export-options .cancel-btn').on('click', model.clearMode);

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
    var template = '<label><input type="checkbox" checked> %s</label>';
    var datasets = model.getDatasets().map(initDataset);
    var hideLayers = datasets.length == 1 && datasets[0].layers.length < 2;
    El('#export-layers').css('display', hideLayers ? 'none' : 'block');
    return datasets;

    function initDataset(dataset) {
      var layers = dataset.layers.map(function(lyr) {
        var html = utils.format(template, lyr.name || '[unnamed layer]');
        var box = El('div').html(html).appendTo(list).findChild('input').node();
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

  function getInputFormats() {
    return model.getDatasets().reduce(function(memo, d) {
      var fmts = d.info && d.info.input_formats || [];
      return memo.concat(fmts);
    }, []);
  }

  function getDefaultExportFormat() {
    var dataset = model.getEditingLayer().dataset;
    return dataset.info && dataset.info.input_format &&
        dataset.info.input_formats[0] || 'geojson';
  }

  function initFormatMenu() {
    var defaults = ['shapefile', 'geojson', 'topojson', 'dsv', 'svg'];
    var formats = utils.uniq(defaults.concat(getInputFormats()));
    var items = formats.map(function(fmt) {
      return utils.format('<div><label><input type="radio" name="format" value="%s"' +
        ' class="radio">%s</label></div>', fmt, MapShaper.getFormatName(fmt));
    });
    El('#export-formats').html(items.join('\n'));
    El('#export-formats input[value="' + getDefaultExportFormat() + '"]').node().checked = true;
  }

  function turnOn() {
    datasets = initLayerMenu();
    initFormatMenu();
    menu.show();
  }

  function turnOff() {
    menu.hide();
  }

  function getSelectedFormat() {
    return El('#export-formats input:checked').node().value;
  }

  function getSelectedLayers() {
    var selections = datasets.reduce(function(memo, obj) {
      var dataset = obj.dataset;
      var selection = obj.layers.reduce(reduceLayer, []);
      if (selection.length > 0) {
        memo.push(utils.defaults({layers: selection}, dataset));
      }
      return memo;
    }, []);

    function reduceLayer(memo, obj) {
      if (obj.checkbox.checked) {
        // shallow-copy layer, so uniqified filenames do not affect original layers
        memo.push(utils.extend({}, obj.layer));
      }
      return memo;
    }
    return selections;
  }

  function initExportButton() {
    new SimpleButton('#save-btn').on('click', function() {
      gui.showProgressMessage('Exporting');
      model.clearMode();
      setTimeout(function() {
        exportMenuSelection(function(err) {
          if (err) {
            if (utils.isString(err)) {
              gui.alert(err);
            } else {
              // stack seems to change if Error is logged directly
              console.error(err.stack);
              gui.alert("Export failed for an unknown reason");
            }
          }
          // hide message after a delay, so it doesn't just flash for an instant.
          setTimeout(gui.clearProgressMessage, err ? 0 : 400);
        });
      }, 20);
    });
  }

  // @done function(string|Error|null)
  function exportMenuSelection(done) {
    var opts, files, datasets;
    try {
      opts = gui.parseFreeformOptions(El('#export-options .advanced-options').node().value, 'o');
      if (!opts.format) opts.format = getSelectedFormat();
      // ignoring command line "target" option
      datasets = getSelectedLayers();
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
          // KLUDGE let exporter know that cloning is not needed
          // (because shape data was deep-copied during merge)
          opts.cloned = true;
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
    } catch(e) {
      return done(e);
    }
    MapShaper.writeFiles(files, opts, done);
  }

  function isMultiLayerFormat(fmt) {
    return fmt == 'svg' || fmt == 'topojson';
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
