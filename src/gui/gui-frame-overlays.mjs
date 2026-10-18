import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { FloatingToolbar } from './gui-floating-toolbar';
import { getOverlayPlacementCommand, getRemoveOverlayCommand } from './gui-overlay-command';

var SVG_NS = 'http://www.w3.org/2000/svg';

// [position, segment label, tooltip]
var cornerOptions = [
  ['top-left', '↖', 'Top left corner'],
  ['top-right', '↗', 'Top right corner'],
  ['bottom-left', '↙', 'Bottom left corner'],
  ['bottom-right', '↘', 'Bottom right corner']
];

// Below this distance in screen pixels, a press on an overlay box is a click
var DRAG_THRESHOLD = 3;

// The overlay frames placed on the frame being previewed, drawn as labeled
// boxes on its page. Dragging a box moves the overlay; on release, the
// placement is re-expressed as the nearest corner and two margins and saved
// with one -frame command. Clicking a box opens a toolbar with the same
// settings as numbers. Each box can also proof the overlay's export-composed
// content in a pointer-events-free SVG layer below the placement chrome.
export function FrameOverlays(gui) {
  var ext = gui.map.getExtent();
  var container = El('div').addClass('frame-overlay-boxes').appendTo('body');
  var previewRoot = document.createElementNS(SVG_NS, 'svg');
  var mapLayers = gui.container.findChild('.map-layers').node();
  var boxes = [];
  var drag = null;
  var shownPreviews = new Set(); // host dataset ID + overlay dataset ID
  var previewCache = new Map(); // overlay dataset ID -> rendered map
  var previewNodes = new Map(); // placement key -> nested SVG
  var previewGeneration = 0;
  // The host page while its frame is being resized, so the boxes follow the
  // corners they are anchored to
  var resizePreview = null;
  var panel = new OverlayToolbar(gui, render);

  previewRoot.setAttribute('class', 'frame-overlay-previews');
  previewRoot.setAttribute('aria-hidden', 'true');
  mapLayers.appendChild(previewRoot);

  gui.frameOverlays = this;

  gui.on('map_rendered', render);
  gui.on('preview_mode_change', render);
  gui.on('undo_redo_post', render);
  gui.model.on('update', function(e) {
    var flags = e.flags || {};
    invalidatePreviewCache(flags);
    render();
  });
  gui.on('frame_resize_preview', function(e) {
    resizePreview = e.frame || null;
    render();
  });

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  this.getBoxes = function() {
    return boxes.map(function(o) {
      return {
        name: o.frame.layer.name,
        box: Object.assign({}, o.box),
        preview: o.showingContent
      };
    });
  };

  function getHost() {
    return gui.map.isPreviewView() ? gui.model.getActiveFrame() : null;
  }

  // The host page on the screen: {left, top, kx, ky}, where k is screen
  // pixels per page pixel
  function getPageTransform() {
    var frame = resizePreview || gui.map.getPreviewFrameData();
    var pos = ext.position();
    var p1, p2;
    if (!frame || !(frame.width > 0) || !(frame.height > 0)) return null;
    p1 = ext.translateCoords(frame.bbox[0], frame.bbox[3]);
    p2 = ext.translateCoords(frame.bbox[2], frame.bbox[1]);
    return {
      left: Math.min(p1[0], p2[0]) + pos.pageX,
      top: Math.min(p1[1], p2[1]) + pos.pageY,
      mapLeft: Math.min(p1[0], p2[0]),
      mapTop: Math.min(p1[1], p2[1]),
      kx: Math.abs(p2[0] - p1[0]) / frame.width,
      ky: Math.abs(p2[1] - p1[1]) / frame.height,
      size: {width: frame.width, height: frame.height}
    };
  }

  function render() {
    var host = getHost();
    var page = host ? getPageTransform() : null;
    var wantedPreviews = new Set();
    if (drag) return; // the box being dragged is positioned by the drag
    container.empty();
    boxes = [];
    sizePreviewRoot();
    if (!page) {
      removeUnusedPreviewNodes(wantedPreviews);
      return;
    }
    internal.getHostOverlays(gui.model, host).forEach(function(o) {
      var size = internal.getFramePageSize(o.frame);
      var key = getPreviewKey(host, o.frame);
      var item = {
        key: key,
        host: host,
        frame: o.frame,
        box: internal.getOverlayBox(o.record, page.size, size),
        fullPage: internal.framesHaveSamePageSize(host, o.frame),
        showingContent: shownPreviews.has(key),
        el: El('div').addClass('frame-overlay-box').appendTo(container)
      };
      addBoxLabel(item);
      item.el.attr('data-overlay', o.frame.layer.name || '');
      item.el.classed('selected', panel.isEditing(o.frame));
      item.el.classed('full-page-overlay', item.fullPage);
      item.el.classed('showing-content', item.showingContent);
      item.el.on('mousedown', function(e) { onMouseDown(e, item); });
      if (item.showingContent) {
        wantedPreviews.add(key);
        item.previewEl = getPreviewNode(item);
      }
      positionBox(item, page);
      boxes.push(item);
    });
    removeUnusedPreviewNodes(wantedPreviews);
  }

  function addBoxLabel(item) {
    var label = El('span').addClass('frame-overlay-box-label').appendTo(item.el);
    El('span').addClass('frame-overlay-preview-toggle')
      .appendTo(label)
      .text(item.showingContent ? 'hide' : 'show')
      .on('mousedown', function(e) {
        e.stopPropagation();
      })
      .on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (item.showingContent) {
          shownPreviews.delete(item.key);
        } else {
          shownPreviews.add(item.key);
        }
        render();
      });
  }

  function positionBox(item, page) {
    item.el.css({
      left: page.left + item.box.x * page.kx,
      top: page.top + item.box.y * page.ky,
      width: Math.max(item.box.width * page.kx, 1),
      height: Math.max(item.box.height * page.ky, 1)
    });
    if (item.previewEl) {
      positionPreview(item, page);
    }
  }

  function positionPreview(item, page) {
    var node = item.previewEl;
    node.setAttribute('x', page.mapLeft + item.box.x * page.kx);
    node.setAttribute('y', page.mapTop + item.box.y * page.ky);
    node.setAttribute('width', Math.max(item.box.width * page.kx, 1));
    node.setAttribute('height', Math.max(item.box.height * page.ky, 1));
  }

  function sizePreviewRoot() {
    previewRoot.style.width = ext.width() + 'px';
    previewRoot.style.height = ext.height() + 'px';
  }

  function getPreviewNode(item) {
    var entry = previewNodes.get(item.key);
    var rendered = getRenderedPreview(item.frame);
    var node;
    if (!rendered) {
      if (entry) {
        entry.node.remove();
        previewNodes.delete(item.key);
      }
      return null;
    }
    if (!entry) {
      node = document.createElementNS(SVG_NS, 'svg');
      node.setAttribute('class', 'frame-overlay-preview');
      node.setAttribute('data-overlay', item.frame.layer.name || '');
      node.setAttribute('overflow', 'hidden');
      previewRoot.appendChild(node);
      entry = {node: node, generation: -1};
      previewNodes.set(item.key, entry);
    }
    node = entry.node;
    if (entry.generation != previewGeneration) {
      node.setAttribute('viewBox', '0 0 ' + rendered.width + ' ' + rendered.height);
      node.innerHTML = rendered.content;
      entry.generation = previewGeneration;
    }
    return node;
  }

  function getRenderedPreview(frame) {
    var id = frame.dataset.id;
    if (!previewCache.has(id)) {
      try {
        previewCache.set(id, internal.renderOverlayFrameMap(gui.model, frame, {
          id_prefix: 'overlay-preview-',
          raster_res: 1
        }));
      } catch (e) {
        console.error(e);
        previewCache.set(id, null);
      }
    }
    return previewCache.get(id);
  }

  function invalidatePreviewCache(flags) {
    var frame, id;
    if (flags.select) return;
    if (flags.simplify_amount || flags.redraw_only) {
      // Slider and live-style updates apply to the active frame. Invalidate
      // only that frame if it has been used as an overlay, so editing a host
      // does not rebuild every proofed overlay on every tick.
      frame = gui.model.getActiveFrame();
      id = frame && frame.dataset.id;
      if (!id || !previewCache.has(id)) return;
      previewCache.delete(id);
    } else {
      previewCache.clear();
    }
    previewGeneration++;
  }

  function removeUnusedPreviewNodes(wanted) {
    previewNodes.forEach(function(entry, key) {
      if (wanted.has(key)) return;
      entry.node.remove();
      previewNodes.delete(key);
    });
  }

  function getPreviewKey(host, overlay) {
    return host.dataset.id + ':' + overlay.dataset.id;
  }

  function onMouseDown(e, item) {
    var page = getPageTransform();
    if (e.button !== 0 || !page) return;
    e.preventDefault();
    e.stopPropagation();
    drag = {
      item: item,
      page: page,
      x: e.pageX,
      y: e.pageY,
      box: Object.assign({}, item.box),
      moved: false
    };
  }

  function onMouseMove(e) {
    var dx, dy;
    if (!drag) return;
    if (drag.item.fullPage) return;
    dx = e.pageX - drag.x;
    dy = e.pageY - drag.y;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    drag.item.el.addClass('dragging');
    drag.item.box.x = drag.box.x + dx / drag.page.kx;
    drag.item.box.y = drag.box.y + dy / drag.page.ky;
    positionBox(drag.item, drag.page);
  }

  function onMouseUp() {
    var o = drag;
    if (!o) return;
    drag = null;
    o.item.el.removeClass('dragging');
    if (!o.moved) {
      panel.open(o.item.host, o.item.frame);
      return;
    }
    runPlacementCommand(gui, o.item.host, o.item.frame,
      internal.getOverlayPlacementFromBox(o.item.box, o.page.size), 'Move overlay', render);
  }
}

function getFrameRef(gui, frame) {
  return internal.formatOptionValue(internal.getLayerTargetId(gui.model, frame.layer));
}

function getOverlayRef(frame) {
  return internal.formatOptionValue(frame.layer.name || '');
}

export function runPlacementCommand(gui, host, overlay, placement, title, onError) {
  runGuiEditCommand(gui, getOverlayPlacementCommand(getFrameRef(gui, host),
    getOverlayRef(overlay), placement), {title: title || 'Place overlay', onError: onError});
}

export function runRemoveOverlayCommand(gui, host, overlay, onSuccess) {
  runGuiEditCommand(gui, getRemoveOverlayCommand(getFrameRef(gui, host),
    getOverlayRef(overlay)), {title: 'Remove overlay', onSuccess: onSuccess});
}

// The placement of one overlay as numbers, in a toolbar below the map like
// the frame resize tool's: a corner of the host page and the distances from
// its two edges, in the host's page pixels. Opened by clicking an overlay box.
function OverlayToolbar(gui, onChange) {
  var toolbar = new FloatingToolbar(gui, {name: 'overlay-toolbar'});
  // frames are looked up by ID, since an undo can replace their objects
  var hostId = null, overlayId = null;
  var nameLabel = toolbar.addLabel('').addClass('overlay-frame-name');
  var fullPageLabel = toolbar.addLabel('Full page')
    .addClass('overlay-full-page-label').hide();
  var cornerControl = toolbar.addSegmentedControl('Corner', cornerOptions.map(function(o) {
    return {value: o[0], label: o[1], tooltip: o[2]};
  }), {classname: 'overlay-corner-control'}).on('change', commit);
  var marginField = toolbar.addTextField('Margin', {
    classname: 'overlay-toolbar-margin-input',
    tooltip: 'Distance from the corner in pixels: one value, or horizontal,vertical'
  }).on('change', commit);
  toolbar.addSeparator();
  toolbar.addTextButton('Remove', {
    tooltip: 'Remove this overlay from the frame'
  }).on('click', function() {
    if (getRecord()) runRemoveOverlayCommand(gui, getHost(), getOverlay(), close);
  });
  toolbar.addSeparator();
  toolbar.addTextButton('Done', {
    tooltip: 'Finish placing the overlay'
  }).on('click', close);

  gui.model.on('update', function(e) {
    var flags = e.flags || {};
    if (!isOpen() || flags.simplify_amount || flags.redraw_only) return;
    refreshOrClose();
  });
  gui.on('undo_redo_post', function() {
    if (isOpen()) refreshOrClose();
  });
  gui.on('preview_mode_change', function(e) {
    if (!e.enabled) close();
  });
  gui.on('interaction_mode_change', close);
  gui.keyboard.on('keydown', function(e) {
    if (isOpen() && e.keyName == 'esc') {
      close();
      e.stopPropagation();
    }
  }, null, 11);

  this.open = function(hostFrame, overlayFrame) {
    hostId = hostFrame.dataset.id;
    overlayId = overlayFrame.dataset.id;
    updateControls();
    toolbar.show();
    onChange();
  };

  // overlayFrame: the frame of an overlay box
  this.isEditing = function(overlayFrame) {
    return isOpen() && overlayFrame.dataset.id == overlayId;
  };

  function isOpen() {
    return toolbar.visible();
  }

  function close() {
    if (!isOpen()) return;
    toolbar.hide();
    hostId = overlayId = null;
    onChange();
  }

  function refreshOrClose() {
    if (getRecord()) updateControls(); else close();
  }

  function updateControls() {
    var rec = getRecord();
    var fullPage;
    if (!rec) return;
    fullPage = internal.framesHaveSamePageSize(getHost(), getOverlay());
    nameLabel.text(getOverlay().layer.name || '');
    if (fullPage) {
      fullPageLabel.show();
      cornerControl.hide();
      marginField.hide();
    } else {
      fullPageLabel.hide();
      cornerControl.show();
      marginField.show();
    }
    cornerControl.setValue(rec.position);
    marginField.setValue(rec.margin_x == rec.margin_y ?
      String(rec.margin_x) : rec.margin_x + ',' + rec.margin_y);
  }

  function commit() {
    var margins = parseMargins(marginField.getValue());
    if (!margins || !getRecord()) {
      updateControls();
      return;
    }
    runPlacementCommand(gui, getHost(), getOverlay(), {
      position: cornerControl.getValue(),
      margin_x: margins[0],
      margin_y: margins[1]
    }, 'Place overlay', updateControls);
  }

  function getHost() {
    return internal.getFrameById(gui.model, hostId);
  }

  function getOverlay() {
    return internal.getFrameById(gui.model, overlayId);
  }

  // The placement, looked up afresh, since commands replace the record
  function getRecord() {
    var host = hostId ? getHost() : null;
    var lyr = host && getOverlay() ? internal.findOverlayLayer(host.dataset, overlayId) : null;
    return lyr ? lyr.data.getReadOnlyRecordAt(0) : null;
  }
}

// "10" or "10,20" (horizontal, vertical) -> [x, y], or null
export function parseMargins(str) {
  var parts = String(str).split(/\s*[, ]\s*/).map(function(s) {
    return s === '' ? NaN : Number(s);
  });
  if (parts.length > 2 || !parts.every(isFinite)) return null;
  return [parts[0], parts.length > 1 ? parts[1] : parts[0]];
}
