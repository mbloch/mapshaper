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

export function LayerControl(gui) {
  var model = gui.model;
  var map = gui.map;
  var el = gui.container.findChild(".layer-control").on('click', GUI.handleDirectEvent(gui.clearMode));
  var btn = gui.container.findChild('.layer-control-btn');
  var isOpen = false;
  var cache = new DomCache();
  var pinAll = el.findChild('.pin-all'); // button for toggling layer visibility

  // layer repositioning
  var dragTargetId = null;
  var dragging = false;
  var layerOrderSlug;

  gui.addMode('layer_menu', turnOn, turnOff, btn.findChild('.header-btn'));

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
    isOpen = true;
    el.findChild('div.info-box-scrolled').css('max-height', El('body').height() - 80);
    render();
    el.show();
  }

  function turnOff() {
    stopDragging();
    isOpen = false;
    el.hide();
  }

  function updateMenuBtn() {
    var lyr = model.getActiveLayer()?.layer;
    var lyrName = lyr?.name || '';
    var menuTitle = lyrName || lyr && '[unnamed layer]' || '[no data]';
    var pageTitle = lyrName || 'mapshaper';
    btn.classed('active', 'true').findChild('.layer-name').html(menuTitle + " &nbsp;&#9660;");
    window.document.title = pageTitle;
  }

  function render() {
    renderLayerList();
    renderSourceFileList();
  }

  function renderSourceFileList() {
    el.findChild('.no-layer-note').classed('hidden', model.getActiveLayer());
    el.findChild('.source-file-section').classed('hidden', !model.getActiveLayer());
    var list = el.findChild('.file-list');
    var files = [];
    list.empty();
    model.forEachLayer(function(lyr, dataset) {
      var file = internal.getLayerSourceFile(lyr, dataset);
      if (!file || files.includes(file)) return;
      files.push(file);
      var warnings = getWarnings(lyr, dataset);
      var html = '<div class="layer-item">';
      html += rowHTML('name', file);
      if (warnings) {
        // html += rowHTML('problems', warnings, 'layer-problems');
        html += rowHTML('', warnings, 'layer-problems');
      }
      html += '</div>';
      list.appendChild(El('div').html(html).firstChild());
    });

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
    // html += '<img class="close-btn" draggable="false" src="images/close.png">';
    if (opts.pinnable) {
      html += '<img class="eye-btn black-eye" draggable="false" src="images/eye.png">';
      html += '<img class="eye-btn green-eye" draggable="false" src="images/eye2.png">';
    }
    html += '</div>';
    return html;
  }

  function initMouseEvents(entry, id, pinnable) {
    entry.on('mouseover', init);
    function init() {
      entry.removeEventListener('mouseover', init);
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
        // don't start dragging if pointer is over the close button
        // (before, clicking this button wqs finicky -- the mouse had to remain
        // perfectly still between mousedown and mouseup)
        if (El(e.target).hasClass('close-btn')) return;
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
    initLayerDragging(entry, id);

    function deleteLayer() {
      var target = findLayerById(id);
      if (map.isVisibleLayer(target.layer)) {
        // TODO: check for double map refresh after model.deleteLayer() below
        setLayerPinning(target.layer, false);
      }
      model.deleteLayer(target.layer, target.dataset);
    }

    function selectLayer(closeMenu) {
      var target = findLayerById(id);
      // don't select if user is typing or dragging
      if (GUI.textIsSelected() || dragging) return;
      // undo any temporary hiding when layer is selected
      target.layer.hidden = false;
      if (!map.isActiveLayer(target.layer)) {
        model.selectLayer(target.layer, target.dataset);
      }
      // close menu after a delay
      if (closeMenu === true) setTimeout(function() {
        gui.clearMode();
      }, 230);
    }

    // init delete button
    // GUI.onClick(entry.findChild('img.close-btn'), function(e) {
    //   e.stopPropagation();
    //   deleteLayer();
    // });

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
        target.layer.name = str;
        gui.session.layerRenamed(target.layer, str);
        updateMenuBtn();
      });

    // init click-to-select
    GUI.onClick(entry, function() {
      selectLayer(true);
    });

    GUI.onContextClick(entry, function(e) {
      e.deleteLayer = deleteLayer;
      e.selectLayer = selectLayer;
      // contextMenu.open(e);
      // openContextMenu(e, null, entry.node())
      openContextMenu(e, null, null);
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
    }
    if (isFrame) {
      str = 'map frame';
    } else if (type) {
      str = utils.format('%,d %s%s', n, type, utils.pluralSuffix(n));
    } else {
      str = "[empty]";
    }
    return str;
  }

  function getWarnings(lyr, dataset) {
    var file = internal.getLayerSourceFile(lyr, dataset);
    var missing = [];
    var msg;
    // show missing file warning for first layer in dataset
    // (assuming it represents the content of the original file)
    if (utils.endsWith(file, '.shp') && lyr == dataset.layers[0]) {
      if (!lyr.data) {
        missing.push('.dbf');
      }
      if (!dataset.info.prj && !dataset.info.crs) {
        missing.push('.prj');
      }
    }
    if (missing.length) {
      msg = 'missing ' + missing.join(' and ') + ' data';
    }
    return msg;
  }

  function describeSrc(lyr, dataset) {
    return internal.getLayerSourceFile(lyr, dataset);
  }

  function isPinnable(lyr) {
    return internal.layerIsGeometric(lyr) || internal.layerHasFurniture(lyr);
  }

  function rowHTML(c1, c2, cname) {
    return utils.format('<div class="row%s"><div class="col1">%s</div>' +
      '<div class="col2">%s</div></div>', cname ? ' ' + cname : '', c1, c2);
  }
}
