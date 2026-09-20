import { internal, utils, error } from './gui-core';
import { SimpleButton } from './gui-elements';
import { sortLayersForMenuDisplay, cleanLayerName, formatLayerNameForDisplay } from './gui-layer-utils';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { ClickText2 } from './gui-elements';
import { loadGeopackageLib, loadGeoParquetLib } from './gui-import-utils';

export async function saveFileContentToClipboard(content) {
  var str = utils.isString(content) ? content : content.toString();
  await navigator.clipboard.writeText(str);
}

// Export buttons and their behavior
export var ExportControl = function(gui) {
  var model = gui.model;
  var unsupportedMsg = "Exporting is not supported in this browser";
  var menu = gui.container.findChild('.export-options').on('click', GUI.handleDirectEvent(gui.clearMode));
  var layersArr = [];
  var menuFormats = null; // formats the format menu was built with
  var formatPickedByUser = false;
  var toggleBtn = null; // checkbox <input> for toggling layer selection
  var exportBtn = gui.container.findChild('.export-btn').addClass('disabled');
  var ofileName = gui.container.findChild('#ofile-name');
  var frameInfo = menu.findChild('.export-frame-info').hide();
  menu.findChild('.advanced-options').on('input', updateFrameInfo);
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

  model.on('update', function() {
    exportBtn.classed('disabled', !model.getActiveLayer());
  });

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
    formatPickedByUser = false;
    // initZipOption();
    initFormatMenu();
    updateFrameInfo();
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
          gui.alert(getExportErrorMessage(err), 'Export failed');
        }
      }).finally(function() {
        gui.clearProgressMessage();
      });
    }, 20);
  }

  function getExportErrorMessage(err) {
    if (err && err.message) return err.message;
    return 'Export failed for an unknown reason';
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
    // note: command line "target" option gets ignored
    var opts = getExportOpts();
    if (opts.format == 'geopackage') {
      await loadGeopackageLib();
    } else if (opts.format == 'geoparquet') {
      await loadGeoParquetLib();
    }
    opts.active_layer = gui.model.getActiveLayer().layer; // kludge to support restoring active layer in gui
    if (opts.format == internal.PACKAGE_EXT) {
      // Embed the session history in .msx exports so that re-importing the
      // file into a fresh session restores the original command history.
      // The .msx file itself is a durable artifact, so mark every captured
      // command as "saved" -- a user reloading the file shouldn't see an
      // unsaved-changes warning for work that lives in the file they just
      // opened.
      var snapshot = gui.session.getHistorySnapshot();
      snapshot.savedAtIndex = snapshot.commands.length;
      opts.history = snapshot;
      targets = addFrameTarget(targets);
    }
    if (opts.format == 'svg' || opts.format == 'topojson') {
      opts.gui_frame = getGuiFrameContext();
    }
    try {
      var files = await internal.exportTargetLayers(model, targets, opts);
    } catch(e) {
      console.error(e);
      throw e;
    }
    gui.session.layersExported(getTargetLayerIds(), getExportOptsAsString());
    if (files.length == 1 && checkboxOn(clipboardCheckbox)) {
      await saveFileContentToClipboard(files[0].content);
    } else {
      await internal.writeFiles(files, opts);
    }
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
    var layers = model.getLayers().filter(function(o) {
      return !internal.isFrameLayer(o.layer, o.dataset.arcs);
    });
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
    refreshFormatMenu(); // the layer selection decides which formats apply
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
    var layers = getExportFormatLayers();
    var active = model.getActiveLayer();
    var dataset = active.dataset;
    var inputFmt = dataset.info && dataset.info.input_formats &&
        dataset.info.input_formats[0];
    // Rasters and nothing else can only go to GeoTIFF, the one format that
    // takes their pixels.
    if (layers.length > 0 && layers.every(hasRaster)) return 'geotiff';
    // SVG is the default for a selection that mixes rasters with vector layers,
    // being the only format that accepts both.
    if (layers.some(hasRaster)) return 'svg';
    return getExportFormats().includes(inputFmt) ? inputFmt : 'geojson';
  }

  function getExportFormats() {
    var formats = ['shapefile', 'json', 'geojson', 'dsv', 'topojson', 'flatgeobuf', 'geopackage', 'geoparquet', 'kml', 'svg', internal.PACKAGE_EXT];
    // GeoTIFF is the one format here that only accepts raster layers, so it is
    // offered only when there is a raster to export.
    if (getExportFormatLayers().some(hasRaster)) formats.push('geotiff');
    return formats;
  }

  // The layers the format menu describes: the ones checked for export, falling
  // back to the active layer when the menu is not up yet or nothing is checked.
  function getExportFormatLayers() {
    var selected = layersArr.length ? getSelectedLayerEntries() : [];
    var active = model.getActiveLayer();
    if (selected.length > 0) {
      return selected.map(function(o) { return o.layer; });
    }
    return active && active.layer ? [active.layer] : [];
  }

  function hasRaster(lyr) {
    return internal.layerHasRaster(lyr);
  }

  function initFormatMenu(preferredFmt) {
    var formats = getExportFormats();
    var items = formats.map(function(fmt) {
      return utils.format('<td><label><input type="radio" name="format" value="%s"' +
        ' class="radio">%s</label></td>', fmt, internal.getFormatName(fmt));
    });
    var table = '<table>';
    for (var i=0; i<items.length; i+=2) {
      table += '<tr>' + items[i] + (items[i+1] || '<td></td>') + '<tr>';
    }
    table += '</table>';
    menu.findChild('.export-formats').html(table);
    menuFormats = formats;
    setSelectedFormat(formats.includes(preferredFmt) ? preferredFmt :
      getDefaultExportFormat());
    // update save-as settings when value changes
    menu.findChildren('input[type="radio"]').forEach(el => {
      el.on('change', onFormatChange);
    });
  }

  function onFormatChange() {
    // A format the user picked is theirs to keep, however the layer selection
    // changes afterwards.
    formatPickedByUser = true;
    updateExportCheckboxes();
    updateFrameInfo();
  }

  function setSelectedFormat(fmt) {
    var el = menu.findChild('.export-formats input[value="' + fmt + '"]');
    if (el) el.node().checked = true;
    updateFrameInfo();
  }

  // Which formats apply depends on what is checked for export, so unchecking
  // the vector layers of a mixed session both offers GeoTIFF and makes it the
  // default -- unless the user has already chosen a format.
  function refreshFormatMenu() {
    var formats = getExportFormats();
    if (formats.join(',') != (menuFormats || []).join(',')) {
      initFormatMenu(formatPickedByUser ? getSelectedFormat() : null);
    } else if (!formatPickedByUser) {
      setSelectedFormat(getDefaultExportFormat());
    }
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
    return menu.findChild('.export-formats input:checked')?.node()?.value;
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

  function getGuiFrameContext() {
    var target = internal.getActiveFrame(model);
    var rec, style;
    if (!target) return null;
    rec = target.layer.data.getReadOnlyRecordAt(0) || {};
    style = {};
    ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
      'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity'
    ].forEach(function(field) {
      if (rec[field] !== undefined && rec[field] !== null && rec[field] !== '') {
        style[field] = rec[field];
      }
    });
    return {
      data: internal.getFrameLayerData(
        target.layer,
        target.dataset.arcs,
        internal.getDatasetCRS(target.dataset)
      ),
      name: target.layer.name || 'frame',
      style: style
    };
  }

  function addFrameTarget(targets) {
    var frame = internal.getActiveFrame(model);
    var group;
    if (!frame) return targets;
    targets = targets.map(function(target) {
      return Object.assign({}, target, {layers: target.layers.slice()});
    });
    group = targets.find(function(target) {
      return target.dataset == frame.dataset;
    });
    if (group) {
      if (!group.layers.includes(frame.layer)) group.layers.push(frame.layer);
    } else {
      targets.push({dataset: frame.dataset, layers: [frame.layer]});
    }
    return targets;
  }

  function updateFrameInfo() {
    if (!frameInfo) return;
    var context = getGuiFrameContext();
    var format = getSelectedFormat();
    var topoUsesPixels = format == 'topojson' &&
      /\b(?:width|height)\s*=/.test(getExportOptsAsString());
    if (context && (format == 'svg' || topoUsesPixels)) {
      frameInfo.text('Map frame: ' +
        internal.formatFrameSizeForDisplay(context.data)).show();
    } else {
      frameInfo.hide();
    }
  }

};
