import { DomCache } from './gui-dom-cache';
import {
  getLayerMenuGroups,
  getFrameCopyName,
  sortLayersForMenuDisplay,
  formatLayerNameForDisplay,
  setLayerPinning,
  layerIsPinnable,
  cleanLayerName } from './gui-layer-utils';
import { utils, internal } from './gui-core';
import { El } from './gui-el';
import { ClickText2 } from './gui-elements';
import { describeFeatureContents, formatCount, getAnnotationTool } from './gui-layer-contents';
import { GUI } from './gui-lib';
import { openContextMenu } from './gui-context-menu';
import { runGuiEditCommand } from './gui-edit-command';
import { runPlacementCommand, runRemoveOverlayCommand } from './gui-frame-overlays';
import { showPopupAlert, showPrompt } from './gui-alert';
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
  var isOpen = false;
  var cache = new DomCache();
  var pinAll = el.findChild('.pin-all'); // button for toggling layer visibility
  var unframedSection = el.findChild('.unframed-section');
  var frameAddGroup = el.findChild('.map-frame-add-group');
  el.findChild('.map-frame-add')
    .on('click', openFrameCreateDialog)
    .on('keydown', function(e) {
      if (e.key == 'Enter' || e.key == ' ') {
        e.preventDefault();
        openFrameCreateDialog();
      }
    });
  GUI.onClick(unframedSection.findChild('.section-toggle'), function(e) {
    e.stopPropagation();
    toggleSection('');
  });
  GUI.onClick(unframedSection.findChild('.layer-section-heading'), activateUnframedView);

  // A new frame is made from the layers of the unframed view
  function openFrameCreateDialog() {
    var unframed = getLayerMenuGroups(model).unframed;
    if (model.getActiveFrame() && unframed.length > 0) {
      model.selectLayer(unframed[0].layer, unframed[0].dataset);
    }
    if (gui.frameTool) gui.frameTool.openCreateDialog();
  }

  // Sections that have been closed: '' for the Layers section, otherwise by
  // frame dataset ID. GUI state only, kept in gui.state so that snapshots
  // can save and restore it.
  function getClosedSections() {
    if (!gui.state.closed_layer_sections) gui.state.closed_layer_sections = {};
    return gui.state.closed_layer_sections;
  }

  function toggleSection(key) {
    var closedSections = getClosedSections();
    closedSections[key] = !closedSections[key];
    renderLayerList();
  }

  // layer repositioning
  var dragTargetId = null;
  var dragging = false;
  var layerOrderSlug;
  var pendingMove = null; // {drag, drop, above}: a drop in another section

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
    // Skip re-rendering the layer list for display-only updates. The simplify
    // slider fires 'simplify_amount' continuously while dragging; these updates
    // don't change layer names, counts, geometry types or icons, so a full
    // re-render is wasteful and makes the panel's icons flicker.
    var flags = e.flags || {};
    if (flags.simplify_amount || flags.redraw_only) return;
    if (isOpen) render();
  });

  el.on('mouseup', function() {
    var move = pendingMove;
    stopDragging();
    if (move) commitDrop(move);
  });
  el.on('mouseleave', stopDragging);

  // init show/hide all button, which pins the unframed layers (a frame's
  // layers are shown or hidden with -frame instead)
  pinAll.on('click', function(e) {
    var allOn = testAllLayersPinned();
    e.stopPropagation();
    if (unframedSection.hasClass('inactive-section')) return;
    getLayerMenuGroups(model).unframed.forEach(function(target) {
      setLayerPinning(target.layer, !allOn);
    });
    El.findAll('.layer-list .pinnable', el.node()).forEach(function(item) {
      El(item).classed('pinned', !allOn);
    });
    updatePinAllButton();
    map.redraw();
  });

  function updatePinAllButton() {
    pinAll.classed('pinned', testAllLayersPinned());
  }

  function testAllLayersPinned() {
    return getLayerMenuGroups(model).unframed.every(function(o) {
      return !isPinnable(o.layer, o.dataset) || o.layer.pinned;
    });
  }

  // a frame's dataset ID, or '' for unframed layers
  function getMenuGroupKey(o) {
    var frame = internal.getFrameForDataset(model, o.dataset);
    return frame ? frame.dataset.id : '';
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
    dragTargetId = layerOrderSlug = pendingMove = null;
    if (dragging) {
      renderLayerList(); // in case menu changed...
      dragging = false;
    }
  }

  // In the Layers section, a drag restacks layers as it goes. Restacking a
  // frame's layers, or moving a layer into or out of a frame, is part of the
  // map, so it is a command, run when the mouse button is released.
  function dragOver(dragId, dropId, above) {
    var drag = findLayerById(dragId);
    var drop = findLayerById(dropId);
    var key;
    pendingMove = null;
    if (!drag || !drop || dragId == dropId) return;
    key = getMenuGroupKey(drag);
    if (isFrameEntry(drop) || key !== '' || key != getMenuGroupKey(drop)) {
      pendingMove = {drag: drag, drop: drop, above: above};
    } else {
      insertLayer(drag, drop, above);
    }
  }

  function isFrameEntry(o) {
    return internal.isFrameLayer(o.layer, o.dataset.arcs);
  }

  // Into a frame, or within one: next to the layer it was dropped on, or on
  // top when dropped on the frame's heading. Out of a frame: the layer goes
  // where it was dropped among the unframed layers once the command has run.
  function commitDrop(move) {
    var drag = move.drag, drop = move.drop;
    var fromFrame = internal.getFrameForDataset(model, drag.dataset);
    var toFrame = isFrameEntry(drop) ? drop : internal.getFrameForDataset(model, drop.dataset);
    var position;
    if (toFrame) {
      position = isFrameEntry(drop) ? 'top' :
        (move.above ? 'above=' : 'below=') + getMemberRef(toFrame, drop.layer);
      if (fromFrame && fromFrame.dataset == toFrame.dataset) {
        if (dropLeavesOrder(toFrame, move)) return;
        runFrameCommand(toFrame, 'order-layers=' + getMemberRef(toFrame, drag.layer) + ' ' + position);
      } else {
        addLayersToFrame(toFrame, [drag], position);
      }
    } else if (fromFrame) {
      runFrameCommand(fromFrame, 'remove-layers=' + getMemberRef(fromFrame, drag.layer), function() {
        insertLayer(drag, drop, move.above);
        renderLayerList();
      });
    }
  }

  // A drop next to the layer's own position, which would add a command to the
  // history that changes nothing
  function dropLeavesOrder(frame, move) {
    var members = getLayerMenuGroups(model).frames.find(function(g) {
      return g.frame.dataset == frame.dataset;
    }).members.map(function(o) { return o.layer; });
    var i = members.indexOf(move.drag.layer);
    if (isFrameEntry(move.drop)) return i === 0;
    // members are listed top first, so "above" is the previous entry
    return members[move.above ? i + 1 : i - 1] == move.drop.layer;
  }

  function insertLayer(dragLyr, dropLyr, above) {
    var slug;
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
    render();
    el.addClass('open');
    el.show();
  }

  function turnOff() {
    if (!isOpen) return;
    stopDragging();
    isOpen = false;
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
    var frameList = el.findChild('.map-frame-list');
    var uniqIds = {};
    var pinnableCount = 0;
    var layerCount = 0;
    var closedSections = getClosedSections();
    var groups, activeFrame, viewFrame, hasLegacyFrame;
    list.empty();
    frameList.empty();
    model.forEachLayer(function(lyr, dataset) {
      // Assign a unique id to each layer, so html strings
      // can be used as unique identifiers for caching rendered HTML, and as
      // an id for layer menu event handlers
      if (!lyr.menu_id || uniqIds[lyr.menu_id]) {
        lyr.menu_id = utils.getUniqueName();
      }
      uniqIds[lyr.menu_id] = true;
      layerCount++;
    });
    groups = getLayerMenuGroups(model);
    activeFrame = model.getActiveFrame();
    pinnableCount = groups.unframed.filter(function(o) {
      return isPinnable(o.layer, o.dataset);
    }).length;

    // Shown for a single layer too: it says whether the next layer made or
    // imported will be drawn over this one or replace it on the map.
    if (pinnableCount < 1) {
      pinAll.hide();
    } else {
      pinAll.show();
      updatePinAllButton();
    }

    // The section whose layers are on the map is the only one whose eye
    // icons work: the active frame's, or the Layers section in the unframed
    // view (a frame without members shows the unframed layers)
    viewFrame = activeFrame && groups.frames.some(function(g) {
      return g.frame.dataset == activeFrame.dataset && g.members.length > 0;
    }) ? activeFrame : null;
    // The active section is marked only when there is another one to select
    el.classed('several-sections', (groups.unframed.length > 0 ? 1 : 0) +
      groups.frames.filter(function(g) { return g.members.length > 0; }).length > 1);
    unframedSection
      .classed('closed', !!closedSections[''])
      .classed('active-section', !viewFrame)
      .classed('inactive-section', !!viewFrame);

    groups.unframed.forEach(function(o) {
      list.appendChild(getLayerEntry(o, {
        pinnable: isPinnable(o.layer, o.dataset)
      }));
    });

    // Each frame has a section of its own, after the Layers section
    groups.frames.forEach(function(g) {
      var id = g.frame.dataset.id;
      var inView = !!viewFrame && viewFrame.dataset == g.frame.dataset;
      var section = El('div').addClass('layer-section frame-section')
        .classed('closed', !!closedSections[id])
        .classed('active-section', inView)
        .classed('inactive-section', !inView)
        .appendTo(frameList);
      var members = El('div').addClass('frame-members');
      section.appendChild(getLayerEntry(g.frame, {
        frame: true,
        pinnable: g.members.length > 0,
        all_visible: g.members.every(function(o) { return !o.layer.frame_hidden; }),
        active_frame: !!activeFrame && activeFrame.dataset == g.frame.dataset
      }));
      section.appendChild(members);
      g.members.forEach(function(o) {
        members.appendChild(getLayerEntry(o, {
          member: true,
          pinnable: isPinnable(o.layer, o.dataset)
        }));
      });
    });

    // A frame without members composes the unframed layers; it is given
    // members from its menu rather than by making another frame
    hasLegacyFrame = groups.frames.length == 1 && groups.frames[0].members.length === 0;
    unframedSection.findChild('.unframed-empty-note')
      .classed('hidden', layerCount === 0 || groups.unframed.length > 0);
    frameAddGroup.classed('hidden', layerCount === 0 || hasLegacyFrame ||
      groups.frames.length > 0 && groups.unframed.length === 0);
  }

  // Switch to the unframed view by selecting the top unframed layer
  function activateUnframedView() {
    var unframed = getLayerMenuGroups(model).unframed;
    var active = model.getActiveLayer();
    if (!unframed.length || unframed.some(function(o) {
      return active && o.layer == active.layer;
    })) return;
    model.selectLayer(unframed[0].layer, unframed[0].dataset);
  }

  function getLayerEntry(o, opts) {
    var html = renderLayer(o.layer, o.dataset, opts);
    var element;
    if (cache.contains(html)) {
      element = cache.use(html);
    } else {
      element = El('div').html(html).firstChild();
      // A frame is not in the layer stack, so its entry can't be dragged
      initMouseEvents(element, o.layer.menu_id, opts.pinnable, !opts.frame);
      cache.add(html, element);
    }
    return element;
  }

  cache.cleanup();

  // opts.pinnable: has an eye icon
  // opts.member: belongs to a frame; the eye icon shows whether the layer is
  //   hidden in the frame (which works like unpinning), not whether it is pinned
  // opts.frame: a frame's section heading, with opts.active_frame; its eye icon
  //   shows whether all the frame's layers are visible (opts.all_visible)
  function renderLayer(lyr, dataset, opts) {
    var classes = 'layer-item';
    var nameHtml;
    var html;

    if (opts.pinnable) classes += ' pinnable';
    if (map.isActiveLayer(lyr)) classes += ' active';
    if (opts.member) {
      classes += ' frame-member';
      if (!lyr.frame_hidden) classes += ' pinned';
      if (map.isActiveLayer(lyr) ? lyr.hidden : lyr.frame_hidden) classes += ' invisible';
    } else if (opts.frame) {
      if (opts.all_visible) classes += ' pinned';
    } else {
      if (lyr.hidden) classes += ' invisible';
      if (lyr.pinned) classes += ' pinned';
    }
    if (opts.frame) {
      classes += ' frame-item layer-section-heading';
      if (opts.active_frame) classes += ' current-frame';
      nameHtml = '<h3><span class="section-arrow section-toggle" role="button" ' +
        'aria-label="Open or close this section"></span>' +
        '<span class="frame-name section-title">' + formatLayerNameForDisplay(lyr.name) + '</span></h3>';
    } else {
      nameHtml = '<span class="layer-name colored-text dot-underline">' +
        formatLayerNameForDisplay(lyr.name) + '</span>';
    }

    html = '<!-- ' + lyr.menu_id + '--><div class="' + classes + '">';
    html += '<div class="layer-row"><div class="layer-name-col">' + nameHtml + '</div>' +
      renderContents(lyr, dataset) + '</div>';
    html += '<span class="more-btn layer-btn" role="button" aria-label="More layer options"></span>';
    if (opts.pinnable) {
      html += '<img class="eye-btn black-eye layer-btn" draggable="false" src="images/eye.png">';
      html += '<img class="eye-btn green-eye layer-btn" draggable="false" src="images/eye2.png">';
    }
    html += '</div>';
    return html;
  }

  // A frame is not in the layer stack, so its entry can't be dragged to reorder
  function initMouseEvents(entry, id, pinnable, draggable) {
    entry.on('mouseover', init);
    entry.on('focusin', init);
    function init() {
      entry.removeEventListener('mouseover', init);
      entry.removeEventListener('focusin', init);
      initMouseEvents2(entry, id, pinnable, draggable);
    }
  }

  // A frame's heading can't be dragged, but a layer can be dropped on it,
  // which puts the layer on top of the frame's layers
  function initLayerDragging(entry, id, isFrameHeading) {

    // support layer drag-drop
    // A drag starts with a press on a layer row, not with a held button
    // entering one, so a press elsewhere (e.g. on the frame) can't reorder layers
    if (!isFrameHeading) {
      entry.on('mousedown', function(e) {
        if (e.button === 0) dragTargetId = id;
      });
    }
    entry.on('mousemove', function(e) {
      var rect, insertionClass;
      // stop dragging when mouse button is released
      if (!e.buttons && (dragging || dragTargetId)) {
        stopDragging();
      }
      if (!dragTargetId) {
        return;
      }
      if (dragTargetId == id) {
        entry.addClass('drag-target');
      }
      if (dragTargetId != id) {
        // signal to redraw menu later; TODO: improve
        dragging = true;
      }
      rect = entry.node().getBoundingClientRect();
      insertionClass = !isFrameHeading && e.pageY - rect.top < rect.height / 2 ?
        'insert-above' : 'insert-below';
      if (!entry.hasClass(insertionClass)) {
        clearClass('dragging');
        clearClass('insert-above');
        clearClass('insert-below');
        entry.addClass('dragging');
        entry.addClass(insertionClass);
        dragOver(dragTargetId, id, insertionClass == 'insert-above');
      }
    });
  }

  function initMouseEvents2(entry, id, pinnable, draggable) {
    var moreBtn = entry.findChild('.more-btn');
    initLayerDragging(entry, id, !draggable);

    function deleteLayer() {
      var target = findLayerById(id);
      var undoTransaction;
      var furniture;
      if (!target) return;
      // a frame's furniture goes with it, rather than becoming a stray layer
      furniture = internal.isFrameLayer(target.layer, target.dataset.arcs) ?
        internal.getFrameFurnitureLayers(target.dataset) : [];
      undoTransaction = createUndoTransaction(gui, 'delete layer');
      if (map.isVisibleLayer(target.layer)) {
        // TODO: check for double map refresh after model.deleteLayer() below
        setLayerPinning(target.layer, false);
      }
      if (undoTransaction) {
        undoTransaction.run(deleteLayers);
        addUndoTransactionToHistory(gui, undoTransaction, {
          flags: {select: true, arc_count: true},
          entryPrefix: 'delete-layer'
        });
      } else {
        deleteLayers();
      }

      function deleteLayers() {
        furniture.forEach(function(lyr) {
          model.deleteLayer(lyr, target.dataset);
        });
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

    // A layer in a section whose layers are not on the map is selected, which
    // shows its section; otherwise a hidden layer is shown as its eye icon
    // would show it
    function zoomToLayer() {
      var target = findLayerById(id);
      var lyr, frame, viewFrame;
      if (!target) return;
      lyr = target.layer;
      frame = internal.getFrameForDataset(model, target.dataset);
      viewFrame = getViewFrame();
      if (frame ? !viewFrame || viewFrame.dataset != frame.dataset : !!viewFrame) {
        lyr.hidden = false;
        model.selectLayer(lyr, target.dataset);
      } else if (map.isActiveLayer(lyr)) {
        lyr.hidden = false;
      } else if (frame && lyr.frame_hidden) {
        runFrameCommand(frame, 'show-layers=' + getMemberRef(frame, lyr), function() {
          map.zoomToLayer(lyr);
        });
        return;
      } else if (!frame) {
        setLayerPinning(lyr, true);
      }
      renderLayerList();
      map.redraw();
      map.zoomToLayer(lyr);
    }

    function showLayerInfo() {
      var target = findLayerById(id);
      var popup, content;
      if (!target) return;
      popup = showPopupAlert('', 'Layer info');
      content = popup.container().addClass('layer-info-popup');
      content.node().appendChild(renderLayerInfo(
        internal.getLayerInfo(target.layer, target.dataset)
      ));
    }

    function openFrameProperties() {
      var target = findLayerById(id);
      if (target && gui.frameProperties) gui.frameProperties.open(target);
    }

    // The scale bar panel edits the active frame's scale bar
    function openScalebarProperties() {
      var target = findLayerById(id);
      if (!target || !gui.scalebarProperties) return;
      activateFrame(target);
      gui.scalebarProperties.open(target);
    }

    function resizeFrame() {
      var target = findLayerById(id);
      if (target) activateFrame(target);
      if (gui.frameTool) gui.frameTool.open();
    }

    function getLayerAnnotationTool(lyr) {
      var records = lyr.geometry_type == 'point' && lyr.data ? lyr.data.getRecords() : null;
      return getAnnotationTool(records, internal.layerHasLabels(lyr),
        internal.layerHasSvgSymbols(lyr));
    }

    function styleLayer() {
      var target = findLayerById(id);
      var tool;
      if (!target) return;
      tool = getLayerAnnotationTool(target.layer);
      if (tool == 'label') {
        // The point style panel can only restyle a label layer; the label tool
        // styles labels and creates, moves and retypes them as well, so a
        // label layer goes there instead. The menu item is named for it.
        if (!map.isActiveLayer(target.layer)) {
          target.layer.hidden = false;
          model.selectLayer(target.layer, target.dataset);
        }
        gui.interaction.setMode('label');
      } else if (tool == 'symbols') {
        // Likewise a symbol layer, which the point style panel has no
        // controls for
        if (!map.isActiveLayer(target.layer)) {
          target.layer.hidden = false;
          model.selectLayer(target.layer, target.dataset);
        }
        gui.interaction.setMode('symbols');
      } else if (target.layer.geometry_type == 'point' && gui.pointStyleTool) {
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
      var isFrame = target &&
        internal.isFrameLayer(target.layer, target.dataset.arcs);
      if (isFrame) {
        menuEvent.frameProperties = openFrameProperties;
        menuEvent.scalebarProperties = openScalebarProperties;
        menuEvent.scalebarLabel =
          internal.findFrameFurnitureLayer(target.dataset, 'scalebar') ?
            'scale bar' : 'add scale bar';
        menuEvent.resizeFrame = resizeFrame;
        menuEvent.frameActions = getFrameMenuActions(target);
        menuEvent.deleteFrame = deleteLayer;
      } else if (target) {
        menuEvent.frameActions = getMembershipMenuActions(target);
        menuEvent.deleteLayer = deleteLayer;
        menuEvent.duplicateLayer = duplicateLayer;
        menuEvent.showLayerInfo = showLayerInfo;
        if (layerHasViewableContent(target.layer)) {
          menuEvent.zoomToLayer = zoomToLayer;
        }
      }
      if (!isFrame && target && layerCanBeStyled(target.layer)) {
        menuEvent.styleLayer = styleLayer;
        if (getLayerAnnotationTool(target.layer) == 'label') {
          menuEvent.styleLayerName = 'style/edit labels';
        } else if (getLayerAnnotationTool(target.layer) == 'symbols') {
          menuEvent.styleLayerName = 'style/edit symbols';
        } else if (target.layer.geometry_type == 'point') {
          menuEvent.styleLayerName = 'style/edit points';
        } else if (target.layer.geometry_type == 'polyline') {
          menuEvent.styleLayerName = 'style/edit lines';
        } else if (target.layer.geometry_type == 'polygon') {
          menuEvent.styleLayerName = 'style/edit polygons';
        }
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
        var frame = internal.getFrameForDataset(model, target.dataset);
        var hidden = false; // active && lyr.hidden || false;
        var pinned = false;
        var unpinned = false;
        e.stopPropagation();
        if (entry.node().closest('.inactive-section')) return;
        if (internal.isFrameLayer(lyr, target.dataset.arcs)) {
          toggleAllFrameLayers(target);
          return;
        }
        if (frame && active) {
          // as in the Layers section, the selected layer is hidden from the
          // map for the moment, without changing the frame
          lyr.hidden = !lyr.hidden;
          entry.classed('invisible', lyr.hidden);
          map.redraw();
          return;
        }
        if (frame) {
          toggleFrameVisibility(target, frame);
          return;
        }
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

    // init name editor (a frame is renamed in its properties panel)
    if (entry.findChild('.layer-name')) {
      new ClickText2(entry.findChild('.layer-name'))
        .on('change', function(e) {
          var target = findLayerById(id);
          var str = cleanLayerName(this.value());
          this.value(formatLayerNameForDisplay(str));
          renameLayer(target, str);
        });
    }

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

    var sectionToggle = entry.findChild('.section-toggle');
    if (sectionToggle) {
      sectionToggle.on('mousedown', function(e) {
        e.stopPropagation();
      });
      GUI.onClick(sectionToggle, function(e) {
        var target = findLayerById(id);
        e.stopPropagation();
        if (target) toggleSection(target.dataset.id);
      });
    }

    // init click-to-select; clicking a frame's heading shows the frame
    GUI.onClick(entry, function() {
      var target = findLayerById(id);
      if (target && internal.isFrameLayer(target.layer, target.dataset.arcs)) {
        activateFrame(target);
      } else {
        selectLayer();
      }
    });

  }

  // The frame's eye shows all its layers if any is hidden, and otherwise hides
  // them all. As with the Layers section's eye, the selected layer stays on
  // the map either way.
  function toggleAllFrameLayers(frame) {
    var anyHidden = internal.getFrameMemberLayers(model, frame).some(function(o) {
      return o.layer.frame_hidden;
    });
    runFrameCommand(frame, (anyHidden ? 'show-layers=' : 'hide-layers=') + '*');
  }

  // Hiding a frame's layer is part of the map, so it is a command, recorded
  // in the session and undoable, unlike pinning
  function toggleFrameVisibility(target, frame) {
    var option = target.layer.frame_hidden ? 'show-layers=' : 'hide-layers=';
    runFrameCommand(frame, option + getMemberRef(frame, target.layer));
  }

  // Items for a frame's menu: copy the frame; and for a frame without
  // members, which composes the visible unframed layers, make those layers
  // its members
  function getFrameMenuActions(frame) {
    var group = getLayerMenuGroups(model).frames.find(function(g) {
      return g.frame.dataset == frame.dataset;
    });
    var visible = getVisibleUnframedLayers();
    var actions = [{label: 'copy frame', run: function() {
      runFrameCommand(frame, '+ name=' +
        internal.formatOptionValue(getFrameCopyName(model, frame.layer.name)));
    }}];
    if (group && group.members.length === 0 && visible.length > 0) {
      actions.push({label: 'move visible layers into frame', run: function() {
        // listed bottom to top, so that they keep their stacking order
        addLayersToFrame(frame, visible.reverse());
      }});
    }
    return actions.concat(getOverlayMenuActions(frame));
  }

  // Placing this frame on another frame's page as an overlay, or taking it off
  function getOverlayMenuActions(frame) {
    var hosts = internal.getOverlayHosts(model, frame);
    var guests = internal.getHostOverlays(model, frame).map(function(o) { return o.frame.dataset; });
    var actions = [];
    internal.getFrames(model).forEach(function(host) {
      var name = utils.htmlEscape(host.layer.name || '');
      if (host.dataset == frame.dataset || guests.includes(host.dataset)) return;
      if (hosts.some(function(o) { return o.dataset == host.dataset; })) {
        actions.push({label: 'remove overlay from: ' + name, run: function() {
          runRemoveOverlayCommand(gui, host, frame);
        }});
      } else if (internal.frameCanContainOverlay(host, frame)) {
        actions.push({label: 'overlay on frame: ' + name, run: function() {
          runPlacementCommand(gui, host, frame, null, 'Overlay frame');
        }});
      }
    });
    return actions;
  }

  // Items for a layer's menu: move it out of its frame, or into a frame
  function getMembershipMenuActions(target) {
    var frame = internal.getFrameForDataset(model, target.dataset);
    if (frame) {
      return [{label: 'move out of frame', run: function() {
        runFrameCommand(frame, 'remove-layers=' + getMemberRef(frame, target.layer));
      }}];
    }
    return internal.getFrames(model).map(function(f) {
      return {
        label: 'move into frame: ' + utils.htmlEscape(f.layer.name || ''),
        run: function() {
          addLayersToFrame(f, [target]);
        }
      };
    });
  }

  // Unframed layers on show, top of the stack first
  function getVisibleUnframedLayers() {
    return getLayerMenuGroups(model).unframed.filter(function(o) {
      var active = map.isActiveLayer(o.layer);
      return isPinnable(o.layer, o.dataset) &&
        (active ? !o.layer.hidden : !!o.layer.pinned);
    });
  }

  function getMemberRef(frame, lyr) {
    return internal.formatOptionValue(internal.getFrameMemberRef(model, frame, lyr));
  }

  function formatLayerList(targets) {
    return internal.formatOptionValue(targets.map(function(o) {
      return internal.getLayerTargetId(model, o.layer);
    }).join(','));
  }

  // Layers in a different coordinate system can join the frame only if they
  // are reprojected, which is offered first. If the frame's coordinate system
  // is unknown, the command runs and reports why the layers cannot join.
  async function addLayersToFrame(frame, targets, position) {
    var options = 'add-layers=' + formatLayerList(targets) + (position ? ' ' + position : '');
    var check = internal.findLayersNeedingReprojection(model, targets, frame);
    var n = check.layers.length;
    var names, msg;
    if (check.reprojectable) {
      names = check.layers.map(function(lyr) {
        return utils.htmlEscape(lyr.name || '[unnamed layer]');
      }).join(', ');
      msg = names + (n == 1 ? ' has' : ' have') + ' a different coordinate system from frame ' +
        utils.htmlEscape(frame.layer.name || '') + '. Would you like to reproject ' +
        (n == 1 ? 'it' : 'them') + ' to match?';
      if (!await showPrompt(msg, n == 1 ? 'Reproject layer?' : 'Reproject layers?')) return;
      options += ' reproject';
    }
    runFrameCommand(frame, options);
  }

  function runFrameCommand(frame, options, onSuccess) {
    var cmd = '-frame target=' +
      internal.formatOptionValue(internal.getLayerTargetId(model, frame.layer)) + ' ' + options;
    runGuiEditCommand(gui, cmd, {title: 'Map frame', onSuccess: onSuccess});
  }

  // The active frame follows the selected layer, so a frame is shown by
  // selecting one of its layers: the top one that is not hidden
  function activateFrame(frame) {
    var active = model.getActiveFrame();
    var members, pick;
    if (active && active.dataset == frame.dataset) return;
    members = getLayerMenuGroups(model).frames.find(function(g) {
      return g.frame.dataset == frame.dataset;
    }).members;
    pick = members.find(function(o) { return !o.layer.frame_hidden; }) || members[0];
    if (pick) model.selectLayer(pick.layer, pick.dataset);
  }

  // Returns {text, title}; title is a tooltip, or null
  function describeLyr(lyr, dataset) {
    if (internal.isFrameLayer(lyr, dataset.arcs)) {
      return {text: internal.formatFrameSizeForDisplay(
        internal.getFrameLayerData(lyr, dataset.arcs)
      ), title: null};
    }
    if (internal.layerHasRaster(lyr)) {
      return {text: utils.format('%,d x %,d raster', internal.getRasterWidth(lyr.raster),
        internal.getRasterHeight(lyr.raster)), title: null};
    }
    if (lyr.data && !lyr.shapes) {
      return {text: formatCount(internal.getFeatureCount(lyr), 'data record'), title: null};
    }
    if (lyr.geometry_type) {
      return describeFeatureContents(lyr.geometry_type, lyr.shapes,
        lyr.data ? lyr.data.getRecords() : null, lyr.data ? lyr.data.getFields() : []);
    }
    return {text: '[empty]', title: null};
  }

  function renderContents(lyr, dataset) {
    var o = describeLyr(lyr, dataset);
    if (!o.title) {
      return '<div class="layer-contents">' + o.text + '</div>';
    }
    return '<div class="layer-contents has-nulls"><span title="' + o.title + '">' +
      o.text + '</span></div>';
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
    if (!fields || fields.length === 0) {
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

  function isPinnable(lyr, dataset) {
    return layerIsPinnable(lyr, dataset);
  }

  function layerHasViewableContent(lyr) {
    return internal.layerHasGeometry(lyr) || internal.layerHasRaster(lyr);
  }

  // The frame whose layers are on the map, or null in the unframed view (a
  // frame without members composes the unframed layers)
  function getViewFrame() {
    var frame = model.getActiveFrame();
    return frame && internal.getFrameMemberLayers(model, frame).length > 0 ? frame : null;
  }

  function layerCanBeStyled(lyr) {
    return !!(lyr && (lyr.geometry_type == 'point' || lyr.geometry_type == 'polyline' || lyr.geometry_type == 'polygon'));
  }

}
