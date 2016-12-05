/* @requires mapshaper-gui-lib mapshaper-mode-button mapshaper-gui-options mapshaper-gui-export */

// Export buttons and their behavior
var ExportControl = function(model) {
  var unsupportedMsg = "Exporting is not supported in this browser";
  var menu = El('#export-options').on('click', gui.handleDirectEvent(model.clearMode));
  var datasets = []; // array of exportable layers grouped by dataset
  new SimpleButton('#export-options .cancel-btn').on('click', model.clearMode);

  if (!gui.exportIsSupported()) {
    El('#export-btn').on('click', function() {
      gui.alert(unsupportedMsg);
    });

    MapShaper.writeFiles = function() {
      error(unsupportedMsg);
    };
  } else {
    new SimpleButton('#save-btn').on('click', onExportClick);
    model.addMode('export', turnOn, turnOff);
    new ModeButton('#export-btn', 'export', model);
  }

  function onExportClick() {
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
        gui.clearProgressMessage();
      });
    }, 20);
  }

  // @done function(string|Error|null)
  function exportMenuSelection(done) {
    var opts, files;
    opts = gui.parseFreeformOptions(El('#export-options .advanced-options').node().value, 'o');
    if (!opts.format) opts.format = getSelectedFormat();
    // ignoring command line "target" option
    try {
      files = gui.exportDatasets(getSelectedLayers(), opts);
    } catch(e) {
      return done(e);
    }
    MapShaper.writeFiles(files, opts, done);
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
    return dataset.info && dataset.info.input_formats &&
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
};
