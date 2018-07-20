/* @requires mapshaper-gui-lib mapshaper-mode-button mapshaper-gui-options mapshaper-gui-export */

// Export buttons and their behavior
var ExportControl = function(gui) {
  var model = gui.model;
  var unsupportedMsg = "Exporting is not supported in this browser";
  var menu = gui.container.findChild('.export-options').on('click', GUI.handleDirectEvent(gui.clearMode));
  var checkboxes = []; // array of layer checkboxes
  var exportBtn = gui.container.findChild('.export-btn');
  new SimpleButton(menu.findChild('.cancel-btn')).on('click', gui.clearMode);

  if (!GUI.exportIsSupported()) {
    exportBtn.on('click', function() {
      gui.alert(unsupportedMsg);
    });

    internal.writeFiles = function() {
      error(unsupportedMsg);
    };
  } else {
    new SimpleButton(menu.findChild('.save-btn')).on('click', onExportClick);
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
      opts = GUI.parseFreeformOptions(menu.findChild('.advanced-options').node().value, 'o');
      if (!opts.format) opts.format = getSelectedFormat();
      // ignoring command line "target" option
      files = internal.exportTargetLayers(getTargetLayers(), opts);
    } catch(e) {
      return done(e);
    }
    internal.writeFiles(files, opts, done);
  }

  function initLayerMenu() {
    var list = menu.findChild('.export-layer-list').empty();
    var template = '<label><input type="checkbox" value="%s" checked> %s</label>';
    var objects = model.getLayers().map(function(o, i) {
      var html = utils.format(template, i + 1, o.layer.name || '[unnamed layer]');
      return {layer: o.layer, html: html};
    });
    internal.sortLayersForMenuDisplay(objects);
    checkboxes = objects.map(function(o) {
      return El('div').html(o.html).appendTo(list).findChild('input').node();
    });
    menu.findChild('.export-layers').css('display', checkboxes.length < 2 ? 'none' : 'block');
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
    menu.findChild('.export-formats').html(items.join('\n'));
    menu.findChild('.export-formats input[value="' + getDefaultExportFormat() + '"]').node().checked = true;
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
    return menu.findChild('.export-formats input:checked').node().value;
  }

  function getTargetLayers() {
    var ids = checkboxes.reduce(function(memo, box, i) {
      if (box.checked) memo.push(box.value);
      return memo;
    }, []).join(',');
    return ids ? model.findCommandTargets(ids) : [];
  }
};
