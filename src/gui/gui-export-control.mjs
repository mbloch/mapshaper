import { internal, utils, error } from './gui-core';
import { SimpleButton } from './gui-elements';
import { getLayerMenuGroups, sortLayersForMenuDisplay, cleanLayerName, formatLayerNameForDisplay } from './gui-layer-utils';
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
  // With frames, the checklist has an unframed group and a group per frame:
  // [{frame, el, checkbox, count, items}]
  var frameGroups = [];
  var selectionTouched = false; // the user has checked or unchecked a layer
  var selectionFormatClass = null; // the kind of format the selection was made for
  var sessionFormat = null; // the format last picked by the user, for this session
  var menuFormats = null; // formats the format menu was built with
  var formatPickedByUser = false;
  var toggleBtn = null; // checkbox <input> for toggling layer selection
  var exportBtn = gui.container.findChild('.export-btn').addClass('disabled');
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
    selectionTouched = false;
    selectionFormatClass = null;
    // initZipOption();
    initFormatMenu(sessionFormat);
    formatPickedByUser = !!sessionFormat && getSelectedFormat() == sessionFormat;
    syncSelectionWithFormat();
    updateToggleBtn();
    menu.show();
  }

  function turnOff() {
    layersArr = [];
    frameGroups = [];
    menu.hide();
  }

  // Frames with members change the checklist: it is grouped by frame, and
  // what starts checked depends on the format
  function hasFrameGroups() {
    return internal.getFrames(model).some(function(frame) {
      return internal.getFrameMemberLayers(model, frame).length > 0;
    });
  }

  // 'map' for formats that draw the map, 'package' for .msx, else 'data'
  function getFormatClass(fmt) {
    if (isRenderedMapFormat(fmt)) return 'map';
    return fmt == internal.PACKAGE_EXT ? 'package' : 'data';
  }

  // A snapshot of a session with frames holds the whole project, since a
  // partial one could leave layers pointing at frames that aren't in it
  function exportsWholeProject(fmt) {
    return fmt == internal.PACKAGE_EXT && hasFrameGroups();
  }

  function syncSelectionWithFormat() {
    var fmt = getSelectedFormat();
    var cls = getFormatClass(fmt);
    menu.findChild('.export-layers').classed('hidden', exportsWholeProject(fmt));
    if (cls != selectionFormatClass && !selectionTouched) {
      selectionFormatClass = cls;
      applyDefaultSelection(cls);
    }
    updateFrameGroups();
  }

  // Without frames, every layer starts checked. With frames, a map format
  // exports each frame with the layers that are shown in it (and no unframed
  // layers), and a data format exports the layers on show in the current
  // view: the active frame's, or the visible unframed layers. In both, the
  // selected layer counts as shown, as it is on the map, unless it has been
  // hidden from the map.
  function applyDefaultSelection(formatClass) {
    var activeFrame = model.getActiveFrame();
    if (frameGroups.length === 0) return;
    layersArr.forEach(function(item) {
      var lyr = item.source;
      var active = gui.map.isActiveLayer(lyr);
      var on;
      if (item.frame) {
        // an overlay frame is drawn in its hosts' maps, so its own map starts
        // unchecked
        on = (active ? !lyr.hidden : !lyr.frame_hidden) && (formatClass == 'map' ?
          !internal.isOverlayFrame(model, item.frame) :
          !!activeFrame && activeFrame.dataset == item.frame.dataset);
      } else {
        on = formatClass != 'map' && !activeFrame &&
          (active ? !lyr.hidden : !!lyr.pinned);
      }
      item.checkbox.checked = on;
    });
  }

  function updateFrameGroups() {
    frameGroups.forEach(function(g) {
      var n = g.items.filter(function(item) { return item.checkbox.checked; }).length;
      g.checkbox.checked = n == g.items.length;
      g.checkbox.indeterminate = n > 0 && n < g.items.length;
      g.count.text(n + ' of ' + g.items.length + (g.items.length == 1 ? ' layer' : ' layers'));
    });
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
    if (targets.length === 0 && !exportsWholeProject(getSelectedFormat())) {
      return gui.alert('No layers were selected');
    }
    // read before clearMode(), which closes the dialog and discards its checklist
    var selection = getExportSelection();
    gui.clearMode();
    gui.showProgressMessage('Exporting');
    setTimeout(function() {
      exportMenuSelection(selection).catch(function(err) {
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

  // The checked layers, as {items: [{target, source, frame}], grouped}.
  // target: the layer as exported (renamed in the dialog, perhaps)
  // source: the layer in the model
  // frame: the layer's frame, if the checklist is grouped by frame
  // grouped: whether the checklist is grouped by frame
  function getExportSelection() {
    return {
      items: layersArr.filter(function(item) {
        return item.checkbox.checked;
      }).map(function(item) {
        return {target: item.target, source: item.source, frame: item.frame};
      }),
      grouped: frameGroups.length > 0
    };
  }

  // done: function(string|Error|null)
  async function exportMenuSelection(selection) {
    // note: command line "target" option gets ignored
    var opts = getExportOpts();
    var targets = internal.groupLayersByDataset(utils.pluck(selection.items, 'target'));
    var exportedLayers = utils.pluck(selection.items, 'source');
    var frame;
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
      if (selection.grouped) {
        targets = getProjectTargets();
        exportedLayers = getContentLayers();
      } else {
        targets = addFrameTarget(targets);
      }
    }
    try {
      var files;
      if (isRenderedMapFormat(opts.format) && selection.grouped) {
        files = await exportFrameMaps(selection.items, opts);
      } else {
        frame = getSelectionFrame(selection);
        if (isRenderedMapFormat(opts.format) || opts.format == 'topojson') {
          opts.gui_frame = getGuiFrameContext(frame);
        }
        if (isRenderedMapFormat(opts.format)) {
          targets = addFrameFurnitureTargets(targets, opts.gui_frame, frame);
        }
        files = await internal.exportTargetLayers(model, targets, opts);
      }
    } catch(e) {
      console.error(e);
      throw e;
    }
    gui.session.layersExported(getLayerIds(exportedLayers), getExportOptsAsString());
    if (files.length == 1 && checkboxOn(clipboardCheckbox)) {
      await saveFileContentToClipboard(files[0].content);
    } else {
      await internal.writeFiles(files, opts);
    }
  }

  function initLayerItem(o, i) {
    var template = '<input type="checkbox" value="%s" checked><span class="layer-name dot-underline-black">%s</span>';
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
    box.addEventListener('click', function() {
      selectionTouched = true;
      updateToggleBtn();
    });

    new ClickText2(el.findChild('.layer-name'))
      .on('change', function(e) {
        var str = cleanLayerName(this.value());
        this.value(formatLayerNameForDisplay(str));
        target.layer.name = str;
        // gui.session.layerRenamed(target.layer, str);
      });


    return {
      target: target,
      source: o.layer,
      frame: null,
      el: el,
      checkbox: box
    };
  }

  // The layers menu's groups: unframed layers, then each frame with its
  // layers. Each row has a checkbox for all of its layers and a count of the
  // checked ones, so it says what will be exported while it is closed.
  function initGroupedLayerItems(list) {
    var groups = getLayerMenuGroups(model);
    var items = [];
    if (groups.unframed.length > 0) {
      var unframedGroup = initLayerGroup(
        'Unframed layers', groups.unframed, items.length, null);
      list.appendChild(unframedGroup.el);
      items = items.concat(unframedGroup.items);
    }
    groups.frames.forEach(function(g) {
      if (g.members.length === 0) return;
      var group = initLayerGroup(
        g.frame.layer.name || '[unnamed frame]', g.members, items.length, g.frame);
      list.appendChild(group.el);
      items = items.concat(group.items);
    });
    return items;
  }

  function initLayerGroup(name, layers, offset, frame) {
    var el = El('div').addClass('export-frame-group closed');
    var row = El('div').addClass('export-frame-row').appendTo(el);
    var label = El('label').appendTo(row);
    var box = El('input').attr('type', 'checkbox').appendTo(label);
    El('span').addClass('export-frame-name')
      .text(name).appendTo(label);
    var toggle = El('span').addClass('export-frame-toggle')
      .attr('role', 'button').attr('tabindex', '0')
      .attr('aria-label', 'Show or hide layers').appendTo(row);
    var count = El('span').addClass('export-frame-count').appendTo(toggle);
    var members = El('div').addClass('export-frame-members').appendTo(el);
    var group = {frame: frame, el: el, checkbox: box.node(), count: count, items: []};
    group.items = layers.map(function(o, i) {
      var item = initLayerItem(o, offset + i);
      item.frame = frame;
      members.appendChild(item.el);
      return item;
    });
    box.on('click', function() {
      var checked = box.node().checked;
      group.items.forEach(function(item) { item.checkbox.checked = checked; });
      selectionTouched = true;
      updateToggleBtn();
    });
    function toggleMembers() {
      el.classed('closed', !el.hasClass('closed'));
    }
    toggle.on('click', toggleMembers);
    toggle.on('keydown', function(e) {
      if (e.key == 'Enter' || e.key == ' ') {
        e.preventDefault();
        toggleMembers();
      }
    });
    frameGroups.push(group);
    return group;
  }

  function initSelectAll() {
    var toggleHtml = '<label><input type="checkbox" value="toggle" checked><span>Select all</span></label>';
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
      selectionTouched = true;
      updateToggleBtn();
    });
    return el;
  }

  function initLayerMenu() {
    var list = menu.findChild('.export-layer-list').empty();
    var layers = model.getLayers().filter(function(o) {
      return !internal.isFrameComponentLayer(o.layer, o.dataset);
    });
    var objects;
    sortLayersForMenuDisplay(layers);
    frameGroups = [];
    toggleBtn = null;

    if (layers.length > 2) {
      // add select all toggle
      list.appendChild(initSelectAll());
    }

    // add layers to menu
    if (hasFrameGroups()) {
      objects = initGroupedLayerItems(list);
    } else {
      objects = layers.map(function(target, i) {
        var o = initLayerItem(target, i);
        list.appendChild(o.el);
        return o;
      });
    }

    // hide checkbox if only one layer
    if (layers.length < 2) {
      menu.findChild('.export-layers input').css('display', 'none');
    }

    return objects;
  }

  function setLayerSelection(checked) {
    layersArr.forEach(function(o) {
      o.checkbox.checked = !!checked;
    });
  }

  function updateToggleBtn() {
    refreshFormatMenu(); // the layer selection decides which formats apply
    updateFrameGroups();
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
    // A session with frames is taken to be making maps
    if (internal.getFrames(model).length > 0) return 'svg';
    // Rasters and nothing else can only go to GeoTIFF, the one format that
    // takes their pixels.
    if (layers.length > 0 && layers.every(hasRaster)) return 'geotiff';
    // SVG is the default for a selection that mixes rasters with vector layers,
    // being the only format that accepts both.
    if (layers.some(hasRaster)) return 'svg';
    return getExportFormats().includes(inputFmt) ? inputFmt : 'geojson';
  }

  function getExportFormats() {
    var formats = ['shapefile', 'json', 'geojson', 'dsv', 'topojson', 'flatgeobuf', 'geopackage', 'geoparquet', 'svg', 'kml'];
    // the menu has two columns, so formats are added in pairs
    if (GUI.mapImageExportIsSupported()) formats.push('png', 'jpg');
    formats.push('html', internal.PACKAGE_EXT);
    // GeoTIFF is the one format here that only accepts raster layers, so it is
    // offered only when there is a raster to export.
    if (getExportFormatLayers().some(hasRaster)) formats.push('geotiff');
    return formats;
  }

  // formats that draw the map, with its frame and furniture
  function isRenderedMapFormat(fmt) {
    return fmt == 'svg' || fmt == 'html' || fmt == 'png' || fmt == 'jpg';
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
    // changes afterwards, and is the one offered next time.
    formatPickedByUser = true;
    sessionFormat = getSelectedFormat();
    syncSelectionWithFormat();
    updateExportCheckboxes();
  }

  function setSelectedFormat(fmt) {
    var el = menu.findChild('.export-formats input[value="' + fmt + '"]');
    if (el) el.node().checked = true;
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
    syncSelectionWithFormat();
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

  // Positions of layers in the model, as session history refers to them
  function getLayerIds(layers) {
    var all = utils.pluck(model.getLayers(), 'layer');
    return layers.map(function(lyr) {
      return all.indexOf(lyr) + 1;
    }).filter(function(id) { return id > 0; });
  }

  function getContentLayers() {
    return model.getLayers().filter(function(o) {
      return !internal.isFrameComponentLayer(o.layer, o.dataset);
    }).map(function(o) { return o.layer; });
  }

  // Every layer, frames and furniture included
  function getProjectTargets() {
    return model.getDatasets().map(function(dataset) {
      return {dataset: dataset, layers: dataset.layers.slice()};
    });
  }

  // The frame that a single-file export is composed in: without frame
  // groups, the active frame (which may be a frame without members, composing
  // the unframed layers); with them, the frame of the checked layers if they
  // are all in one
  function getSelectionFrame(selection) {
    var frame;
    if (!selection.grouped) return model.getActiveFrame();
    frame = selection.items.length > 0 ? selection.items[0].frame : null;
    return frame && selection.items.every(function(item) {
      return item.frame && item.frame.dataset == frame.dataset;
    }) ? frame : null;
  }

  // One map per frame with checked layers, and one frameless map of any
  // checked unframed layers. When there are several files, each frame's is
  // named after the frame.
  async function exportFrameMaps(items, opts) {
    var parts = [];
    var files = [];
    items.forEach(function(item) {
      var key = item.frame ? item.frame.dataset : null;
      var part = parts.find(function(p) { return p.key == key; });
      if (!part) {
        parts.push(part = {key: key, frame: item.frame, entries: []});
      }
      part.entries.push(item.target);
    });
    for (var part of parts) {
      var partOpts = Object.assign({}, opts);
      var targets = internal.groupLayersByDataset(part.entries);
      if (part.frame) {
        partOpts.gui_frame = getGuiFrameContext(part.frame);
        targets = addFrameFurnitureTargets(targets, partOpts.gui_frame, part.frame);
        if (parts.length > 1) {
          partOpts.file = internal.getFrameExportFilename(part.frame, opts.file, opts.format);
        }
      }
      files = files.concat(await internal.exportTargetLayers(model, targets, partOpts));
    }
    return files;
  }

  function getGuiFrameContext(target) {
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

  // Snapshots keep the frame and its furniture
  function addFrameTarget(targets) {
    var frame = model.getActiveFrame();
    if (!frame) return targets;
    return addDatasetTargets(targets, frame.dataset,
      [frame.layer].concat(internal.getFrameFurnitureLayers(frame.dataset)));
  }

  // The frame's furniture is drawn in SVG output, the way it is in preview.
  // An unprojected frame can't show a scalebar, so it doesn't block the export
  // (overlay frames don't depend on the host's projection).
  function addFrameFurnitureTargets(targets, frameContext, frame) {
    var furniture = frame ? internal.getFrameFurnitureLayers(frame.dataset) : [];
    if (furniture.length === 0) return targets;
    if (internal.getFurnitureFrameProblem(frameContext && frameContext.data)) {
      if (furniture.some(function(lyr) { return !internal.layerIsOverlay(lyr); })) {
        console.warn('Map furniture was not exported: the map frame is unprojected');
      }
      furniture = furniture.filter(internal.layerIsOverlay);
    }
    return addDatasetTargets(targets, frame.dataset, furniture);
  }

  function addDatasetTargets(targets, dataset, layers) {
    var group;
    targets = targets.map(function(target) {
      return Object.assign({}, target, {layers: target.layers.slice()});
    });
    group = targets.find(function(target) {
      return target.dataset == dataset;
    });
    if (!group) {
      group = {dataset: dataset, layers: []};
      targets.push(group);
    }
    layers.forEach(function(lyr) {
      if (!group.layers.includes(lyr)) group.layers.push(lyr);
    });
    return targets;
  }
};
