import { internal, utils, error } from './gui-core';
import { SimpleButton } from './gui-elements';
import { sortLayersForMenuDisplay, cleanLayerName, formatLayerNameForDisplay } from './gui-layer-utils';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { ClickText2 } from './gui-elements';
import { groupLayersByDataset } from '../dataset/mapshaper-target-utils';

// Export buttons and their behavior
export var ExportControl = function(gui) {
  var model = gui.model;
  var unsupportedMsg = "Exporting is not supported in this browser";
  var menu = gui.container.findChild('.export-options').on('click', GUI.handleDirectEvent(gui.clearMode));
  var layersArr = [];
  var toggleBtn = null; // checkbox <input> for toggling layer selection
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
    new SimpleButton(menu.findChild('.save-btn').addClass('default-btn')).on('click', onExportClick);
    gui.addMode('export', turnOn, turnOff, exportBtn);
    gui.keyboard.onMenuSubmit(menu, onExportClick);
  }

  function turnOn() {
    layersArr = initLayerMenu();
    initFormatMenu();
    menu.show();
  }

  function turnOff() {
    layersArr = [];
    menu.hide();
  }

  function getSelectedLayers() {
    var targets = layersArr.reduce(function(memo, o) {
      return o.checkbox.checked ? memo.concat(o.target) : memo;
    }, []);
    return groupLayersByDataset(targets);
  }

  function onExportClick() {
    var layers = getSelectedLayers();
    if (layers.length === 0) {
      return gui.alert('No layers were selected');
    }
    gui.clearMode();
    gui.showProgressMessage('Exporting');
    setTimeout(function() {
      exportMenuSelection(layers, function(err) {
        if (err) {
          if (utils.isString(err)) {
            gui.alert(err);
          } else {
            // stack seems to change if Error is logged directly
            console.error(err.stack);
            gui.alert('Export failed for an unknown reason');
          }
        }
        gui.clearProgressMessage();
      });
    }, 20);
  }

  function getExportOpts() {
    return GUI.parseFreeformOptions(getExportOptsAsString(), 'o');
  }

  function getExportOptsAsString() {
    var freeform = menu.findChild('.advanced-options').node().value;
    if (/format=/.test(freeform) === false) {
      freeform += ' format=' + getSelectedFormat();
    }
    return freeform.trim();
  }

  // done: function(string|Error|null)
  function exportMenuSelection(layers, done) {
    var opts, files;
    try {
      opts = getExportOpts();
      // note: command line "target" option gets ignored
      files = internal.exportTargetLayers(layers, opts);
      gui.session.layersExported(getTargetLayerIds(), getExportOptsAsString());
    } catch(e) {
      return done(e);
    }
    internal.writeFiles(files, opts, done);
  }

  function initLayerItem(o, i) {
    var template = '<input type="checkbox" value="%s" checked> <span class="layer-name dot-underline-black">%s</span>';
    var target = {
      dataset: o.dataset,
      // shallow-copy layer, so it can be renamed in the export dialog
      // without changing its name elsewhere
      layer: Object.assign({}, o.layer)
    };
    var html = utils.format(template, i + 1, target.layer.name || '[unnamed layer]');
    // return {layer: o.layer, html: html};
    var el = El('div').html(html).addClass('layer-item');
    var box = el.findChild('input').node();
    box.addEventListener('click', updateToggleBtn);

    new ClickText2(el.findChild('.layer-name'))
      .on('change', function(e) {
        var str = cleanLayerName(this.value());
        this.value(formatLayerNameForDisplay(str));
        target.layer.name = str;
        // gui.session.layerRenamed(target.layer, str);
      });


    return {
      target: target,
      el: el,
      checkbox: box
    };
  }

  function initSelectAll() {
    var toggleHtml = '<label><input type="checkbox" value="toggle" checked> Select All</label>';
    var el = El('div').html(toggleHtml);
    var btn = el.findChild('input').node();
    toggleBtn = btn;

    btn.addEventListener('click', function() {
      var state = getSelectionState();
      if (state == 'all') {
        setLayerSelection(false);
      } else {
        setLayerSelection(true);
      }
      updateToggleBtn();
    });
    return el;
  }

  function initLayerMenu() {
    var list = menu.findChild('.export-layer-list').empty();
    var layers = model.getLayers();
    sortLayersForMenuDisplay(layers);

    if (layers.length > 2) {
      // add select all toggle
      list.appendChild(initSelectAll());
    }

    // add layers to menu
    var objects = layers.map(function(target, i) {
      var o = initLayerItem(target, i);
      list.appendChild(o.el);
      return o;
    });

    // hide checkbox if only one layer
    if (layers.length < 2) {
      menu.findChild('.export-layers input').css('display', 'none');
    }

    // update menu title
    gui.container.findChild('.export-layers .menu-title').html(layers.length == 1 ? 'Layer name' : 'Layers');

    return objects;
  }

  function setLayerSelection(checked) {
    layersArr.forEach(function(o) {
      o.checkbox.checked = !!checked;
    });
  }

  function updateToggleBtn() {
    if (!toggleBtn) return;
    var state = getSelectionState();
    // style of intermediate checkbox state doesn't look right in Chrome --
    // removing intermediate state, only using checked and unchecked states
    if (state == 'all') {
      toggleBtn.checked = true;
    } else if (state == 'some') {
      toggleBtn.checked = false;
    } else {
      toggleBtn.checked = false;
    }
  }

  function getSelectionState() {
    var count = getTargetLayerIds().length;
    if (count == layersArr.length) return 'all';
    if (count === 0) return 'none';
    return 'some';
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

  function getSelectedFormat() {
    return menu.findChild('.export-formats input:checked').node().value;
  }

  function getTargetLayerIds() {
    return layersArr.reduce(function(memo, o, i) {
      if (o.checkbox.checked) memo.push(o.checkbox.value);
      return memo;
    }, []);
  }

};
