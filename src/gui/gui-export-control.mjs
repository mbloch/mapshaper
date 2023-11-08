import { internal, utils, error } from './gui-core';
import { SimpleButton } from './gui-elements';
import { sortLayersForMenuDisplay, cleanLayerName, formatLayerNameForDisplay } from './gui-layer-utils';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { ClickText2 } from './gui-elements';

// Export buttons and their behavior
export var ExportControl = function(gui) {
  var model = gui.model;
  var unsupportedMsg = "Exporting is not supported in this browser";
  var menu = gui.container.findChild('.export-options').on('click', GUI.handleDirectEvent(gui.clearMode));
  var layersArr = [];
  var toggleBtn = null; // checkbox <input> for toggling layer selection
  var exportBtn = gui.container.findChild('.export-btn');
  var ofileName = gui.container.findChild('#ofile-name');
  new SimpleButton(menu.findChild('.close2-btn')).on('click', gui.clearMode);

  if (!GUI.exportIsSupported()) {
    exportBtn.on('click', function() {
      gui.alert(unsupportedMsg);
    });

    internal.writeFiles = function() {
      error(unsupportedMsg);
    };
    return;
  }

  new SimpleButton(menu.findChild('#export-btn').addClass('default-btn')).on('click', onExportClick);
  gui.addMode('export', turnOn, turnOff, exportBtn);
  gui.keyboard.onMenuSubmit(menu, onExportClick);
  var savePreferenceCheckbox;
  if (window.showSaveFilePicker) {
    savePreferenceCheckbox = menu.findChild('#save-preference')
      .css('display', 'inline-block')
      .findChild('input')
      .on('change', function() {
        GUI.setSavedValue('choose-save-dir', this.checked);
      })
      .attr('checked', GUI.getSavedValue('choose-save-dir') || null);
  }
  var clipboardCheckbox = menu.findChild('#save-to-clipboard')
    .findChild('input')
    .on('change', function() {
      updateExportCheckboxes();
    });

  function setDisabled(inputEl, flag) {
    if (!inputEl) return;
    inputEl.node().disabled = !!flag;
    inputEl.parent().css({color: flag ? '#bbb' : 'black'});
  }

  function checkboxOn(inputEl) {
    if (!inputEl) return false;
    return inputEl.node().checked && !inputEl.node().disabled;
  }

  function updateExportCheckboxes() {
    // disable cliboard if not usable
    var canUseClipboard = clipboardIsAvailable();
    setDisabled(clipboardCheckbox, !canUseClipboard);

    // disable save to directory checkbox if clipboard is selected
    setDisabled(savePreferenceCheckbox, checkboxOn(clipboardCheckbox));
  }

  function clipboardIsAvailable() {
    var layers = getSelectedLayerEntries();
    var fmt = getSelectedFormat();
    return layers.length == 1 && ['json', 'geojson', 'dsv', 'topojson'].includes(fmt);
  }


  function turnOn() {
    layersArr = initLayerMenu();
    // initZipOption();
    initFormatMenu();
    updateExportCheckboxes();
    menu.show();
  }

  function turnOff() {
    layersArr = [];
    menu.hide();
  }

  function getSelectedLayerEntries() {
    return layersArr.reduce(function(memo, o) {
      return o.checkbox.checked ? memo.concat(o.target) : memo;
    }, []);
  }

  function getExportTargets() {
    return internal.groupLayersByDataset(getSelectedLayerEntries());
  }

  function onExportClick() {
    var targets = getExportTargets();
    if (targets.length === 0) {
      return gui.alert('No layers were selected');
    }
    gui.clearMode();
    gui.showProgressMessage('Exporting');
    setTimeout(function() {
      exportMenuSelection(targets).catch(function(err) {
        if (utils.isString(err)) {
          gui.alert(err);
        } else {
          // stack seems to change if Error is logged directly
          console.error(err.stack);
          gui.alert('Export failed for an unknown reason');
        }
      }).finally(function() {
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
    if (getZipOption()) {
      freeform += ' zip';
    }
    return freeform.trim();
  }

  // done: function(string|Error|null)
  async function exportMenuSelection(targets) {
    var opts = getExportOpts();
    // note: command line "target" option gets ignored
    var files = await internal.exportTargetLayers(targets, opts);
    gui.session.layersExported(getTargetLayerIds(), getExportOptsAsString());
    if (files.length == 1 && checkboxOn(clipboardCheckbox)) {
      await saveFileContentToClipboard(files[0].content);
    } else {
      await utils.promisify(internal.writeFiles)(files, opts);
    }

  }

  async function saveFileContentToClipboard(content) {
    var str = utils.isString(content) ? content : content.toString();
    await navigator.clipboard.writeText(str);
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
    updateExportCheckboxes(); // checkbox visibility is affected by number of export layers
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

  function getDefaultExportFormat() {
    var dataset = model.getActiveLayer().dataset;
    var inputFmt = dataset.info && dataset.info.input_formats &&
        dataset.info.input_formats[0];
    return getExportFormats().includes(inputFmt) ? inputFmt : 'geojson';
  }

  function getExportFormats() {
    // return ['shapefile', 'geojson', 'topojson', 'json', 'dsv', 'kml', 'svg', internal.PACKAGE_EXT];
    return ['shapefile', 'json', 'geojson', 'dsv', 'topojson', 'kml', internal.PACKAGE_EXT, 'svg'];
  }

  function initFormatMenu() {
    var formats = getExportFormats();
    // var formats = utils.uniq(getExportFormats().concat(getInputFormats()));
    var items = formats.map(function(fmt) {
      return utils.format('<td><label><input type="radio" name="format" value="%s"' +
        ' class="radio">%s</label></td>', fmt, internal.getFormatName(fmt));
    });
    var table = '<table>';
    for (var i=0; i<items.length; i+=2) {
      table += '<tr>' + items[i] + items[i+1] + '<tr>';
    }
    table += '</table>';

    // menu.findChild('.export-formats').html(items.join('\n'));
    menu.findChild('.export-formats').html(table);
    menu.findChild('.export-formats input[value="' + getDefaultExportFormat() + '"]').node().checked = true;
    // update save-as settings when value changes
    menu.findChildren('input[type="radio"]').forEach(el => {
      el.on('change', updateExportCheckboxes);
    });
  }


  // function getInputFormats() {
  //   return model.getDatasets().reduce(function(memo, d) {
  //     var fmts = d.info && d.info.input_formats || [];
  //     return memo.concat(fmts);
  //   }, []);
  // }


  function initZipOption() {
    var html = `<label><input type="checkbox">Save to .zip file</label>`;
    menu.findChild('.export-zip-option').html(html);
  }

  function getSelectedFormat() {
    return menu.findChild('.export-formats input:checked').node().value;
  }

  function getZipOption() {
    return !!menu.findChild('.export-zip-option input:checked');
  }

  function getTargetLayerIds() {
    return layersArr.reduce(function(memo, o, i) {
      if (o.checkbox.checked) memo.push(o.checkbox.value);
      return memo;
    }, []);
  }

};
