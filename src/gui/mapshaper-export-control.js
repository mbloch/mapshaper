/* @requires mapshaper-gui-lib mapshaper-mode-button mapshaper-gui-options mapshaper-gui-export */

// Export buttons and their behavior
var ExportControl = function(gui) {
  var model = gui.model;
  var unsupportedMsg = "Exporting is not supported in this browser";
  var menu = El('#export-options').on('click', gui.handleDirectEvent(gui.clearMode));
  var checkboxes = []; // array of layer checkboxes
  var exportBtn = gui.container.findChild('.export-btn');
  new SimpleButton('#export-options .cancel-btn').on('click', gui.clearMode);

  if (!gui.exportIsSupported()) {
    exportBtn.on('click', function() {
      gui.alert(unsupportedMsg);
    });

    internal.writeFiles = function() {
      error(unsupportedMsg);
    };
  } else {
    new SimpleButton('#save-btn').on('click', onExportClick);
    gui.addMode('export', turnOn, turnOff);
    new ModeButton(exportBtn, 'export');
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
    var list = El('#export-layer-list').empty();
    var template = '<label><input type="checkbox" value="%s" checked> %s</label>';
    var objects = model.getLayers().map(function(o, i) {
      var html = utils.format(template, i + 1, o.layer.name || '[unnamed layer]');
      return {layer: o.layer, html: html};
    });
    internal.sortLayersForMenuDisplay(objects);
    checkboxes = objects.map(function(o) {
      return El('div').html(o.html).appendTo(list).findChild('input').node();
    });
    El('#export-layers').css('display', checkboxes.length < 2 ? 'none' : 'block');
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
    var defaults = ['shapefile', 'geojson', 'topojson', 'json', 'dsv', 'svg'];
    var formats = utils.uniq(defaults.concat(getInputFormats()));
    var items = formats.map(function(fmt) {
      return utils.format('<div><label><input type="radio" name="format" value="%s"' +
        ' class="radio">%s</label></div>', fmt, internal.getFormatName(fmt));
    });
    El('#export-formats').html(items.join('\n'));
    El('#export-formats input[value="' + getDefaultExportFormat() + '"]').node().checked = true;
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

  function getTargetLayers() {
    var ids = checkboxes.reduce(function(memo, box, i) {
      if (box.checked) memo.push(box.value);
      return memo;
    }, []).join(',');
    return ids ? model.findCommandTargets(ids) : [];
  }
};
