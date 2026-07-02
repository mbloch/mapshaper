import { DomCache } from './gui-dom-cache';
import {
  sortLayersForMenuDisplay,
  formatLayerNameForDisplay,
  setLayerPinning,
  cleanLayerName } from './gui-layer-utils';
import { utils, internal } from './gui-core';
import { El } from './gui-el';
import { ClickText2 } from './gui-elements';
import { GUI } from './gui-lib';
import { openContextMenu } from './gui-context-menu';
import { runGuiEditCommand } from './gui-edit-command';
import { showPopupAlert } from './gui-alert';
import {
  addUndoTransactionToHistory,
  createUndoTransaction
} from './gui-app-undo';

export function LayerControl(gui) {
  var model = gui.model;
  var map = gui.map;
  var el = gui.container.findChild(".layer-control").hide();
  var btn = gui.container.findChild('.layer-control-btn');
  var headerBtn = btn.findChild('.active-layer-label');
  var tab = gui.container.findChild('.layer-tab');
  var isOpen = false;
  var cache = new DomCache();
  var pinAll = el.findChild('.pin-all'); // button for toggling layer visibility

  // layer repositioning
  var dragTargetId = null;
  var dragging = false;
  var layerOrderSlug;

  headerBtn.on('click', function() {
    toggle();
  }).on('keydown', function(e) {
    if (e.key == 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    } else if (e.key == ' ') {
      e.preventDefault();
      e.stopPropagation();
      gui.toggleSidebarPanel('console');
    }
  });
  tab.on('click', toggle).on('keydown', function(e) {
    if (e.key == 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    } else if (e.key == ' ') {
      e.preventDefault();
      e.stopPropagation();
      gui.toggleSidebarPanel('console');
    }
  });

  function toggle() {
    gui.toggleSidebarPanel('layers');
  }

  gui.on('sidebar', function(e) {
    if (e.panels.includes('layers')) {
      turnOn();
    } else if (e.prev.includes('layers')) {
      turnOff();
    }
  });

  // kludge to show menu button after initial import dialog is dismissed
  gui.on('mode', function(e) {
    if (!e.name) {
      updateMenuBtn();
    }
  });

  model.on('update', function(e) {
    updateMenuBtn();
    if (isOpen) render();
  });

  el.on('mouseup', stopDragging);
  el.on('mouseleave', stopDragging);

  // init show/hide all button
  pinAll.on('click', function() {
    var allOn = testAllLayersPinned();
    model.getLayers().forEach(function(target) {
      setLayerPinning(target.layer, !allOn);
    });
    El.findAll('.pinnable', el.node()).forEach(function(item) {
      El(item).classed('pinned', !allOn);
    });
    map.redraw();
  });

  function updatePinAllButton() {
    pinAll.classed('pinned', testAllLayersPinned());
  }

  function testAllLayersPinned() {
    var allPinned = true;
    model.forEachLayer(function(lyr, dataset) {
      if (isPinnable(lyr) && !lyr.pinned) {
        allPinned = false;
      }
    });
    return allPinned;
  }

  function findLayerById(id) {
    return model.findLayer(function(lyr, dataset) {
      return lyr.menu_id == id;
    });
  }

  function getLayerOrderSlug() {
    return sortLayersForMenuDisplay(model.getLayers()).map(function(o) {
      return map.isVisibleLayer(o.layer) ? o.layer.menu_id : '';
    }).join('');
  }

  function clearClass(name) {
    var targ = el.findChild('.' + name);
    if (targ) targ.removeClass(name);
  }

  function stopDragging() {
    clearClass('dragging');
    clearClass('drag-target');
    clearClass('insert-above');
    clearClass('insert-below');
    dragTargetId = layerOrderSlug = null;
    if (dragging) {
      renderLayerList(); // in case menu changed...
      dragging = false;
    }
  }

  function insertLayer(dragId, dropId, above) {
    var dragLyr = findLayerById(dragId);
    var dropLyr = findLayerById(dropId);
    var slug;
    if (dragId == dropId) return;
    dragLyr.layer.menu_order = dropLyr.layer.menu_order + (above ? 0.5 : -0.5);
    slug = getLayerOrderSlug();
    if (slug != layerOrderSlug) {
      layerOrderSlug = slug;
      map.redraw();
    }
  }

  function turnOn() {
    if (isOpen) return;
    isOpen = true;
    tab.addClass('active').attr('aria-expanded', 'true');
    render();
    el.addClass('open');
    el.show();
  }

  function turnOff() {
    if (!isOpen) return;
    stopDragging();
    isOpen = false;
    tab.removeClass('active').attr('aria-expanded', 'false');
    el.removeClass('open');
    el.hide();
  }

  function updateMenuBtn() {
    var lyr = model.getActiveLayer()?.layer;
    var lyrName = lyr?.name || '';
    var pageTitle = lyrName || 'mapshaper';
    btn.classed('active', !!lyr);
    headerBtn.text(lyr ? 'Active: ' + formatLayerNameForDisplay(lyr.name) : '');
    window.document.title = pageTitle;
  }

  function render() {
    renderLayerList();
    el.findChild('.no-layer-note').classed('hidden', model.getActiveLayer());
  }

  function renderLayerList() {
    var list = el.findChild('.layer-list');
    var uniqIds = {};
    var pinnableCount = 0;
    var layerCount = 0;
    list.empty();
    model.forEachLayer(function(lyr, dataset) {
      // Assign a unique id to each layer, so html strings
      // can be used as unique identifiers for caching rendered HTML, and as
      // an id for layer menu event handlers
      if (!lyr.menu_id || uniqIds[lyr.menu_id]) {
        lyr.menu_id = utils.getUniqueName();
      }
      uniqIds[lyr.menu_id] = true;
      if (isPinnable(lyr)) pinnableCount++;
      layerCount++;
    });

    if (pinnableCount < 2) {
      pinAll.hide();
    } else {
      pinAll.show();
      updatePinAllButton();
    }

    sortLayersForMenuDisplay(model.getLayers()).forEach(function(o) {
      var lyr = o.layer;
      var opts = {
        show_source: layerCount < 5,
        pinnable: pinnableCount > 0 && isPinnable(lyr)
      };
      var html, element;
      html = renderLayer(lyr, o.dataset, opts);
      if (cache.contains(html)) {
        element = cache.use(html);
      } else {
        element = El('div').html(html).firstChild();
        initMouseEvents(element, lyr.menu_id, opts.pinnable);
        cache.add(html, element);
      }
      list.appendChild(element);
    });
  }

  cache.cleanup();

  function renderLayer(lyr, dataset, opts) {
    var classes = 'layer-item';
    var entry, html;

    if (opts.pinnable) classes += ' pinnable';
    if (map.isActiveLayer(lyr)) classes += ' active';
    if (lyr.hidden) classes += ' invisible';
    if (lyr.pinned) classes += ' pinned';

    html = '<!-- ' + lyr.menu_id + '--><div class="' + classes + '">';
    html += rowHTML('name', '<span class="layer-name colored-text dot-underline">' + formatLayerNameForDisplay(lyr.name) + '</span>', 'row1');
    html += rowHTML('contents', describeLyr(lyr, dataset));
    html += '<span class="more-btn layer-btn" role="button" tabindex="0" aria-label="More layer options"></span>';
    if (opts.pinnable) {
      html += '<img class="eye-btn black-eye layer-btn" draggable="false" src="images/eye.png">';
      html += '<img class="eye-btn green-eye layer-btn" draggable="false" src="images/eye2.png">';
    }
    html += '</div>';
    return html;
  }

  function initMouseEvents(entry, id, pinnable) {
    entry.on('mouseover', init);
    entry.on('focusin', init);
    function init() {
      entry.removeEventListener('mouseover', init);
      entry.removeEventListener('focusin', init);
      initMouseEvents2(entry, id, pinnable);
    }
  }

  function initLayerDragging(entry, id) {

    // support layer drag-drop
    entry.on('mousemove', function(e) {
      var rect, insertionClass;
      // stop dragging when mouse button is released
      if (!e.buttons && (dragging || dragTargetId)) {
        stopDragging();
      }
      // start dragging when button is first pressed
      if (e.buttons && !dragTargetId) {
        dragTargetId = id;
        entry.addClass('drag-target');
      }
      if (!dragTargetId) {
        return;
      }
      if (dragTargetId != id) {
        // signal to redraw menu later; TODO: improve
        dragging = true;
      }
      rect = entry.node().getBoundingClientRect();
      insertionClass = e.pageY - rect.top < rect.height / 2 ? 'insert-above' : 'insert-below';
      if (!entry.hasClass(insertionClass)) {
        clearClass('dragging');
        clearClass('insert-above');
        clearClass('insert-below');
        entry.addClass('dragging');
        entry.addClass(insertionClass);
        insertLayer(dragTargetId, id, insertionClass == 'insert-above');
      }
    });
  }

  function initMouseEvents2(entry, id, pinnable) {
    var moreBtn = entry.findChild('.more-btn');
    initLayerDragging(entry, id);

    function deleteLayer() {
      var target = findLayerById(id);
      var undoTransaction;
      if (!target) return;
      undoTransaction = createUndoTransaction(gui, 'delete layer');
      if (map.isVisibleLayer(target.layer)) {
        // TODO: check for double map refresh after model.deleteLayer() below
        setLayerPinning(target.layer, false);
      }
      if (undoTransaction) {
        undoTransaction.run(function() {
          model.deleteLayer(target.layer, target.dataset);
        });
        addUndoTransactionToHistory(gui, undoTransaction, {
          flags: {select: true, arc_count: true},
          entryPrefix: 'delete-layer'
        });
      } else {
        model.deleteLayer(target.layer, target.dataset);
      }
    }

    // Duplicate a layer by running an equivalent command, so the copy is
    // recorded in session history and can be undone. Uses '-filter true +'
    // to append a copy without replacing the source, keeps the same name
    // (if any), and targets the source layer explicitly so the menu works on
    // layers that aren't currently active. The '+' output becomes the new
    // default target, which selects the copy as the active layer.
    function duplicateLayer() {
      var target = findLayerById(id);
      var parts = ['-filter true +'];
      if (!target) return;
      if (target.layer.name) {
        parts.push('name=' + internal.formatOptionValue(target.layer.name));
      }
      if (!map.isActiveLayer(target.layer)) {
        parts.push('target=' +
          internal.formatOptionValue(internal.getLayerTargetId(model, target.layer)));
      }
      runGuiEditCommand(gui, parts.join(' '), {
        title: 'Duplicate layer'
      });
    }

    function selectLayer() {
      var target = findLayerById(id);
      // don't select if user is typing or dragging
      if (GUI.textIsSelected() || dragging) return;
      // undo any temporary hiding when layer is selected
      target.layer.hidden = false;
      if (!map.isActiveLayer(target.layer)) {
        model.selectLayer(target.layer, target.dataset);
      }
    }

    function showLayerInfo() {
      var target = findLayerById(id);
      var popup, content;
      if (!target) return;
      popup = showPopupAlert('', 'Layer info');
      content = popup.container().addClass('layer-info-popup');
      content.node().appendChild(renderLayerInfo(internal.getLayerInfo(target.layer, target.dataset)));
    }

    function styleLayer() {
      var target = findLayerById(id);
      if (!target) return;
      if (target.layer.geometry_type == 'point' && gui.pointStyleTool) {
        gui.pointStyleTool.open(target.layer, target.dataset);
      } else if (gui.layerStyleTool) {
        gui.layerStyleTool.open(target.layer, target.dataset);
      }
    }

    function openLayerMenu(e) {
      var menuEvent = e;
      var target = findLayerById(id);
      e.stopPropagation();
      if (!isFinite(e.pageX) || !isFinite(e.pageY)) {
        var rect = moreBtn.node().getBoundingClientRect();
        menuEvent = {
          pageX: rect.right,
          pageY: rect.top + rect.height / 2
        };
      }
      menuEvent.deleteLayer = deleteLayer;
      menuEvent.duplicateLayer = duplicateLayer;
      menuEvent.showLayerInfo = showLayerInfo;
      if (target && layerCanBeStyled(target.layer)) {
        menuEvent.styleLayer = styleLayer;
      }
      menuEvent.contextMenuId = 'layer-' + id;
      openContextMenu(menuEvent, null, null);
    }


    if (pinnable) {
      // init pin button
      GUI.onClick(entry.findChild('img.black-eye'), function(e) {
        var target = findLayerById(id);
        var lyr = target.layer;
        var active = map.isActiveLayer(lyr);
        var hidden = false; // active && lyr.hidden || false;
        var pinned = false;
        var unpinned = false;
        e.stopPropagation();
        if (active) {
          hidden = !lyr.hidden;
          pinned = !hidden && lyr.unpinned;
          unpinned = lyr.pinned && hidden;
        } else {
          pinned = !lyr.pinned;
        }
        lyr.hidden = hidden;
        lyr.unpinned = unpinned;
        setLayerPinning(lyr, pinned);
        entry.classed('pinned', pinned);
        entry.classed('invisible', hidden);
        updatePinAllButton();
        map.redraw();
      });

      // catch click event on black (top) pin button button
      GUI.onClick(entry.findChild('img.black-eye'), function(e) {
        e.stopPropagation();
      });
    }

    // init name editor
    new ClickText2(entry.findChild('.layer-name'))
      .on('change', function(e) {
        var target = findLayerById(id);
        var str = cleanLayerName(this.value());
        this.value(formatLayerNameForDisplay(str));
        renameLayer(target, str);
      });

    moreBtn.on('mousedown', function(e) {
      e.stopPropagation();
    });
    GUI.onClick(moreBtn, openLayerMenu);
    moreBtn.on('keydown', function(e) {
      if (e.key == 'Enter' || e.key == ' ') {
        e.preventDefault();
        openLayerMenu(e);
      }
    });

    // init click-to-select
    GUI.onClick(entry, function() {
      selectLayer();
    });

  }

  function describeLyr(lyr, dataset) {
    var n = internal.getFeatureCount(lyr),
        isFrame = internal.isFrameLayer(lyr, dataset.arcs),
        str, type;
    if (lyr.data && !lyr.shapes) {
      type = 'data record';
    } else if (lyr.geometry_type) {
      type = lyr.geometry_type + ' feature';
    } else if (internal.layerHasRaster(lyr)) {
      type = 'raster layer';
    }
    if (isFrame) {
      str = 'map frame';
    } else if (internal.layerHasRaster(lyr)) {
      str = utils.format('%,d x %,d %s', internal.getRasterWidth(lyr.raster), internal.getRasterHeight(lyr.raster), type);
    } else if (type) {
      str = utils.format('%,d %s%s', n, type, utils.pluralSuffix(n));
    } else {
      str = "[empty]";
    }
    return str;
  }

  function renderLayerInfo(info) {
    var container = document.createElement('div');
    var title = document.createElement('div');
    container.className = 'console-info';
    title.className = 'console-info-title';
    title.textContent = 'Layer: ' + (info.layer_name || '[unnamed layer]');
    container.appendChild(title);
    container.appendChild(renderKeyValueTable(getInfoRows(info), 'console-info-table'));
    if (!info.raster_type) {
      container.appendChild(renderAttributeInfoTable(info.attribute_data));
    }
    return container;
  }

  function getInfoRows(info) {
    var rows = [
      ['Type', info.raster_type ? 'raster data' : info.geometry_type || 'tabular data']
    ];
    if (info.raster_type) {
      rows.push(['Size', utils.format('%,d x %,d x %,d', info.raster_width, info.raster_height, info.raster_bands)]);
      rows.push(['Data', info.raster_pixel_type || 'unknown']);
    } else {
      rows.push(['Records', utils.format('%,d', info.feature_count)]);
    }
    if (info.null_shape_count > 0) {
      rows.push(['Nulls', utils.format("%'d", info.null_shape_count)]);
    }
    if (info.raster_type || info.geometry_type && info.feature_count > info.null_shape_count) {
      rows.push(['Bounds', info.bbox.join(',')]);
      rows.push(['CRS', info.proj4]);
    }
    rows.push(['Source', info.source_file || 'n/a']);
    return rows;
  }

  function renderAttributeInfoTable(fields) {
    var wrapper = document.createElement('div');
    var title = document.createElement('div');
    wrapper.className = 'console-attribute-info';
    title.className = 'console-info-subtitle';
    title.textContent = 'Attribute data';
    wrapper.appendChild(title);
    if (!fields) {
      var none = document.createElement('div');
      none.className = 'console-info-empty';
      none.textContent = '[none]';
      wrapper.appendChild(none);
      return wrapper;
    }
    wrapper.appendChild(renderDataTable(
      [['Field', 'First value']].concat(fields.map(function(o) {
        var valKey = 'first_value' in o ? 'first_value' : 'value';
        return [o.field, formatInfoValue(o[valKey])];
      })),
      'console-attribute-table'
    ));
    return wrapper;
  }

  function renderKeyValueTable(rows, className) {
    return renderDataTable(rows, className + ' console-key-value-table');
  }

  function renderDataTable(rows, className) {
    var table = document.createElement('table');
    var tbody = document.createElement('tbody');
    table.className = className;
    rows.forEach(function(row, i) {
      var tr = document.createElement('tr');
      row.forEach(function(val) {
        var cell = document.createElement(i === 0 && rows.length > 1 && className == 'console-attribute-table' ? 'th' : 'td');
        cell.textContent = val == null ? '' : String(val);
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  function formatInfoValue(val) {
    if (val === null || val === undefined) return '';
    if (utils.isString(val)) {
      return "'" + val.replace(/[\r\t\n]/g, function(c) {
        return c == '\n' ? '\\n' : c == '\r' ? '\\r' : '\\t';
      }) + "'";
    }
    if (utils.isNumber(val) || val === true || val === false) {
      return String(val);
    }
    return JSON.stringify(val);
  }

  function renameLayer(target, name) {
    var undoTransaction;
    if (!target || target.layer.name == name) return;
    undoTransaction = createUndoTransaction(gui, 'rename layer');
    if (undoTransaction) {
      undoTransaction.captureLayerMetadataBefore(target.layer, {operation: 'renameLayer', unit: 'name'});
      target.layer.name = name;
      markLayerChanged(target.layer, {operation: 'renameLayer', unit: 'name'});
      addUndoTransactionToHistory(gui, undoTransaction, {
        flags: {select: true},
        entryPrefix: 'rename-layer'
      });
    } else {
      target.layer.name = name;
    }
    gui.session.layerRenamed(target.layer, name);
    updateMenuBtn();
  }

  function markLayerChanged(layer, detail) {
    if (internal.UndoTracking && internal.UndoTracking.markLayerChanged) {
      internal.UndoTracking.markLayerChanged(layer, detail);
    }
  }

  function isPinnable(lyr) {
    return internal.layerIsGeometric(lyr) || internal.layerHasRaster(lyr) || internal.layerHasFurniture(lyr);
  }

  function layerCanBeStyled(lyr) {
    return !!(lyr && (lyr.geometry_type == 'point' || lyr.geometry_type == 'polyline' || lyr.geometry_type == 'polygon'));
  }

  function rowHTML(c1, c2, cname) {
    return utils.format('<div class="row%s"><div class="col1">%s</div>' +
      '<div class="col2">%s</div></div>', cname ? ' ' + cname : '', c1, c2);
  }
}
