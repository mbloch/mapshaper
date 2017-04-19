/* @requires mapshaper-gui-lib mapshaper-mode-button mapshaper-gui-options mapshaper-gui-export */

// Export buttons and their behavior
var ExportControl = function(model) {
  var unsupportedMsg = "Exporting is not supported in this browser";
  var menu = El('#export-options').on('click', gui.handleDirectEvent(gui.clearMode));
  var checkboxes = []; // array of layer checkboxes
  new SimpleButton('#export-options .cancel-btn').on('click', gui.clearMode);

  if (!gui.exportIsSupported()) {
    El('#export-btn').on('click', function() {
      gui.alert(unsupportedMsg);
    });

    internal.writeFiles = function() {
      error(unsupportedMsg);
    };
  } else {
    new SimpleButton('#save-btn').on('click', onExportClick);
    gui.addMode('export', turnOn, turnOff);
    new ModeButton('#export-btn', 'export');
  }

  function onExportClick() {
    gui.showProgressMessage('Exporting');
    gui.clearMode();
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
    try {
      opts = gui.parseFreeformOptions(El('#export-options .advanced-options').node().value, 'o');
      if (!opts.format) opts.format = getSelectedFormat();
      // ignoring command line "target" option
      files = internal.exportTargetLayers(getTargetLayers(), opts);
    } catch(e) {
      return done(e);
    }
    internal.writeFiles(files, opts, done);
  }

  function initLayerMenu() {
    // init layer menu with current editing layer selected
    var list = El('#export-layer-list').empty();
    var template = '<label><input type="checkbox" checked> %s</label>';
    var checkboxes = [];
    model.forEachLayer(function(lyr, dataset) {
      var html = utils.format(template, lyr.name || '[unnamed layer]');
      var box = El('div').html(html).appendTo(list).findChild('input').node();
      checkboxes.push(box);
    });
    El('#export-layers').css('display', checkboxes.length < 2 ? 'none' : 'block');
    return checkboxes;
  }

  function getInputFormats() {
    return model.getDatasets().reduce(function(memo, d) {
      var fmts = d.info && d.info.input_formats || [];
      return memo.concat(fmts);
    }, []);
  }

  function getDefaultExportFormat() {
    var dataset = model.getActiveLayer().dataset;
    return dataset.info && dataset.info.input_formats &&
        dataset.info.input_formats[0] || 'geojson';
  }

  function initFormatMenu() {
    var defaults = ['shapefile', 'geojson', 'topojson', 'dsv', 'svg'];
    var formats = utils.uniq(defaults.concat(getInputFormats()));
    var items = formats.map(function(fmt) {
      return utils.format('<div><label><input type="radio" name="format" value="%s"' +
        ' class="radio">%s</label></div>', fmt, internal.getFormatName(fmt));
    });
    El('#export-formats').html(items.join('\n'));
    El('#export-formats input[value="' + getDefaultExportFormat() + '"]').node().checked = true;
  }

  function turnOn() {
    checkboxes = initLayerMenu();
    initFormatMenu();
    menu.show();
  }

  function turnOff() {
    menu.hide();
  }

  function getSelectedFormat() {
    return El('#export-formats input:checked').node().value;
  }

  function getTargetLayers() {
    var ids = checkboxes.reduce(function(memo, box, i) {
      if (box.checked) memo.push(String(i + 1)); // numerical layer id
      return memo;
    }, []).join(',');
    return ids ? model.findCommandTargets(ids) : [];
  }
};
