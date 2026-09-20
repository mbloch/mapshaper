import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { quoteCommandValue } from './gui-command-utils';
import { showPopupAlert } from './gui-alert';
import { translateDisplayPoint } from './gui-display-utils';
import { HighlightBox } from './gui-highlight-box';
import { FloatingToolbar } from './gui-floating-toolbar';

export function FrameResizeTool(gui) {
  var ext = gui.map.getExtent();
  var lockSize = false;
  var on = false;
  var drawing = false;
  var drawingRequested = false;
  var drawWidth = '800px';
  var drawSource = null;
  var drawInstructions = null;
  var frameBox = new HighlightBox(gui, {
    name: 'frame-editor',
    classname: 'frame-edit-box',
    persistent: true,
    handles: true,
    draggable: false
  });
  var drawBox = new HighlightBox(gui, {
    name: 'frame-draw',
    classname: 'frame-draw-box',
    clickToStart: true,
    persistent: true,
    handles: true,
    draggable: true
  });
  var toolbar = new FloatingToolbar(gui, {name: 'frame-toolbar'});
  var lockButton = toolbar.addTextButton('Crop', {
    tooltip: 'Switch between crop and change-scale resizing'
  }).on('click', function() {
    setLockSize(!lockSize);
  });
  toolbar.addTextButton('Fit view').on('click', fitCurrentView);
  toolbar.addTextButton('Fit layers').on('click', fitVisibleLayers);
  toolbar.addSeparator();
  toolbar.addTextButton('Done', {
    tooltip: 'Finish resizing'
  }).on('click', function() {
    gui.interaction.turnOff();
  });
  var drawToolbar = new FloatingToolbar(gui, {name: 'frame-draw-toolbar'});
  var drawDoneButton = drawToolbar.addTextButton('Done')
    .setEnabled(false)
    .on('click', finishFrameDrawing);
  drawToolbar.addTextButton('Cancel').on('click', function() {
    gui.interaction.turnOff();
  });

  gui.frameTool = this;

  this.open = function() {
    if (getFrameTarget()) {
      gui.interaction.setMode('frame');
    } else {
      openCreateDialog();
    }
  };

  this.openCreateDialog = openCreateDialog;
  this.isLockSize = function() { return lockSize; };
  this.setLockSize = setLockSize;

  frameBox.on('handle_drag', previewFrameDrag);
  frameBox.on('handle_up', commitFrameDrag);
  drawBox.on('dragend', function() {
    drawDoneButton.enable();
    hideFrameDrawingInstructions('fade');
  });

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'frame' || e.mode == 'frame_draw') turnOn();
    else turnOff();
  });

  gui.model.on('update', function() {
    if (on) syncFrameOverlay();
  });

  gui.on('undo_redo_post', function() {
    if (on) syncFrameOverlay();
  });

  gui.keyboard.on('keydown', function(e) {
    if ((on || drawing) && e.keyName == 'esc') {
      gui.interaction.turnOff();
      e.stopPropagation();
    }
  }, 10);

  function turnOn() {
    if (drawingRequested) {
      drawingRequested = false;
      drawing = true;
      drawBox.turnOn();
      drawDoneButton.disable();
      drawToolbar.show();
      showFrameDrawingInstructions();
      return;
    }
    if (!getFrameTarget()) {
      gui.interaction.turnOff();
      openCreateDialog();
      return;
    }
    on = true;
    frameBox.turnOn();
    toolbar.show();
    if (gui.previewMode && !gui.previewMode.isOn()) {
      gui.previewMode.setOn(true);
    }
    syncFrameOverlay();
  }

  function turnOff() {
    if (on) {
      on = false;
      frameBox.turnOff();
      toolbar.hide();
      if (gui.previewMode) gui.previewMode.clearTemporaryReadout();
    }
    if (drawing) {
      drawing = false;
      drawBox.turnOff();
      drawToolbar.hide();
      hideFrameDrawingInstructions();
      drawSource = null;
    }
  }

  function setLockSize(value) {
    lockSize = !!value;
    lockButton.setSelected(lockSize);
    lockButton.setText(lockSize ? 'Change scale' : 'Crop');
  }

  function syncFrameOverlay() {
    var frame = gui.map.isPreviewView() && gui.map.getPreviewFrameData();
    if (frame) frameBox.setDataCoords(frame.bbox.slice());
    else frameBox.hide();
  }

  function previewFrameDrag(e) {
    var frame = gui.map.getPreviewFrameData();
    if (!frame || !e.map_bbox) return;
    var width = getDragWidth(frame, e.map_bbox, e.handle);
    var aspect = frame.aspect_ratio ||
      getBboxWidth(e.map_bbox) / getBboxHeight(e.map_bbox);
    var temporaryFrame = Object.assign({}, frame, {
      bbox: e.map_bbox.slice(),
      width: width,
      height: Math.round(width / aspect)
    });
    gui.previewMode.setTemporaryReadout(
      temporaryFrame,
      getPixelWidth(e.map_bbox) / width
    );
  }

  function commitFrameDrag(e) {
    var target = getFrameTarget();
    var displayFrame = gui.map.getPreviewFrameData();
    var width = null;
    var targetScale = null;
    if (!target || !displayFrame || !e.map_bbox) return;
    if (e.handle?.type != 'center' && !lockSize) {
      var frame = internal.getFrameLayerData(target.layer, target.dataset.arcs);
      var widthPx = getDragWidth(displayFrame, e.map_bbox, e.handle);
      width = formatNumber(widthPx / getUnitFactor(frame.units)) + frame.units;
      targetScale = getPixelWidth(e.map_bbox) / widthPx;
    }
    gui.previewMode.clearTemporaryReadout();
    updateFrameBounds(
      target,
      getDisplayBoundsInLayerCRS(target.layer, e.map_bbox),
      width,
      targetScale
    );
  }

  function getDragWidth(frame, bbox, handle) {
    if (handle?.type == 'center' || lockSize) return frame.width;
    return frame.width * getBboxWidth(bbox) / getBboxWidth(frame.bbox);
  }

  function updateFrameBounds(target, bbox, width, targetScale) {
    var parts = [
      '-update-frame',
      'bbox=' + quoteCommandValue(bbox.join(','))
    ];
    if (width) parts.push('width=' + quoteCommandValue(width));
    parts.push(getTargetOption(target));
    runGuiEditCommand(gui, parts.join(' '), {
      title: 'Resize map frame',
      onSuccess: function() {
        if (targetScale) {
          ext.zoomToFrameMagnification(targetScale);
          gui.dispatchEvent('map_interaction_end');
        }
      },
      onError: syncFrameOverlay
    });
  }

  function fitCurrentView() {
    var target = getFrameTarget();
    if (!target) return;
    updateFrameBounds(
      target,
      getDisplayBoundsInLayerCRS(target.layer, ext.getBounds().toArray()),
      null
    );
  }

  function fitVisibleLayers() {
    var target = getFrameTarget();
    var entries = getCompositionEntries();
    if (!target || !entries.length) return;
    var bounds = entries.reduce(function(memo, o) {
      return memo.mergeBounds(
        internal.getLayerBounds(o.layer, o.dataset.arcs)
      );
    }, new internal.Bounds());
    updateFrameBounds(target, bounds.toArray(), null);
  }

  function openCreateDialog() {
    if (getFrameTarget()) {
      gui.interaction.setMode('frame');
      return;
    }
    if (!getSourceLayer()) {
      showPopupAlert(
        'Add one or more layers before creating a map frame.',
        'Map frame'
      );
      return;
    }
    var popup = showPopupAlert('', 'Add map frame');
    var content = popup.container().addClass('frame-create-popup');
    El('p').appendTo(content)
      .text('Create a frame from the current map view or visible layers.');
    var row = El('label').addClass('frame-create-width').appendTo(content);
    El('span').appendTo(row).text('Output width');
    var input = El('input').attr('type', 'text').appendTo(row);
    input.node().value = '800px';
    var buttons = El('div').addClass('frame-create-buttons').appendTo(content);
    addButton(buttons, 'Frame this view', function() {
      popup.close();
      createFromView(getWidth());
    });
    addButton(buttons, 'Fit visible layers', function() {
      popup.close();
      createFromVisibleLayers(getWidth());
    });
    addButton(buttons, 'Draw frame', function() {
      popup.close();
      beginFrameDrawing(getWidth());
    });

    function getWidth() {
      var value = input.node().value.trim();
      return parseFloat(value) > 0 ? value : '800px';
    }
  }

  function beginFrameDrawing(width) {
    drawSource = getSourceLayer();
    if (!drawSource) {
      showPopupAlert(
        'Add or select a geographic layer before creating a frame.',
        'Map frame'
      );
      return;
    }
    drawWidth = width;
    drawingRequested = true;
    gui.interaction.setMode('frame_draw');
  }

  function showFrameDrawingInstructions() {
    drawInstructions = showPopupAlert(
      'Click to place the first corner, then click the opposite corner. ' +
      'Drag the handles to resize the frame.',
      null,
      {non_blocking: true, max_width: '380px'}
    );
  }

  function hideFrameDrawingInstructions(action) {
    if (!drawInstructions) return;
    drawInstructions.close(action);
    drawInstructions = null;
  }

  function finishFrameDrawing() {
    var displayBounds = drawBox.getDisplayCoords();
    var source = drawSource;
    if (!displayBounds || !source) return;
    var bbox = getDisplayBoundsInLayerCRS(source, displayBounds);
    gui.interaction.turnOff();
    runCreateCommand(
      '-frame bbox=' + quoteCommandValue(bbox.join(',')) +
      ' width=' + quoteCommandValue(drawWidth) +
      ' name=frame target=' +
      internal.formatOptionValue(internal.getLayerTargetId(gui.model, source))
    );
  }

  function createFromView(width) {
    var source = getSourceLayer();
    if (!source) {
      showPopupAlert(
        'Add or select a geographic layer before creating a frame.',
        'Map frame'
      );
      return;
    }
    var bbox = getDisplayBoundsInLayerCRS(
      source,
      ext.getBounds().toArray()
    );
    runCreateCommand(
      '-frame bbox=' + quoteCommandValue(bbox.join(',')) +
      ' width=' + quoteCommandValue(width) +
      ' name=frame target=' +
      internal.formatOptionValue(internal.getLayerTargetId(gui.model, source))
    );
  }

  function createFromVisibleLayers(width) {
    var entries = getCompositionEntries();
    if (!entries.length) {
      showPopupAlert('No visible geographic layers are available.', 'Map frame');
      return;
    }
    var ids = entries.map(function(o) {
      return internal.getLayerTargetId(gui.model, o.layer);
    });
    runCreateCommand(
      '-frame width=' + quoteCommandValue(width) +
      ' name=frame target=' + internal.formatOptionValue(ids.join(','))
    );
  }

  function runCreateCommand(cmd) {
    runGuiEditCommand(gui, cmd, {
      title: 'Create map frame',
      onSuccess: function() {
        gui.previewMode.setOn(true);
      }
    });
  }

  function getFrameTarget() {
    return internal.getActiveFrame(gui.model);
  }

  function getTargetOption(target) {
    return 'target=' +
      internal.formatOptionValue(internal.getLayerTargetId(gui.model, target.layer));
  }

  function getSourceLayer() {
    var active = gui.model.getActiveLayer();
    if (active && active.layer && active.layer.geometry_type &&
        !internal.isFrameLayer(active.layer, active.dataset.arcs)) {
      return active.layer;
    }
    var entries = getCompositionEntries();
    return entries.length ? entries[0].layer : null;
  }

  function getCompositionEntries() {
    var layers = gui.map.getCompositionLayers();
    return gui.model.getLayers().filter(function(o) {
      return layers.includes(o.layer);
    });
  }

  function getDisplayBoundsInLayerCRS(layer, view) {
    if (!layer.gui?.invertPoint) return view.slice();
    var bounds = new internal.Bounds();
    var steps = 16;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      mergeDisplayPoint(bounds, layer, view[0] + getBboxWidth(view) * t, view[1]);
      mergeDisplayPoint(bounds, layer, view[0] + getBboxWidth(view) * t, view[3]);
      mergeDisplayPoint(bounds, layer, view[0], view[1] + getBboxHeight(view) * t);
      mergeDisplayPoint(bounds, layer, view[2], view[1] + getBboxHeight(view) * t);
    }
    return bounds.toArray();
  }

  function mergeDisplayPoint(bounds, layer, x, y) {
    var p = translateDisplayPoint(layer, [x, y]);
    if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      bounds.mergePoint(p[0], p[1]);
    }
  }

  function getPixelWidth(bbox) {
    var a = ext.translateCoords(bbox[0], bbox[1]);
    var b = ext.translateCoords(bbox[2], bbox[1]);
    return Math.abs(b[0] - a[0]);
  }
}

function addButton(parent, label, action) {
  El('div').addClass('btn dialog-btn').appendTo(parent)
    .text(label).on('click', action);
}

function getUnitFactor(units) {
  return units == 'in' ? 72 : units == 'cm' ? 28.3465 : 1;
}

function formatNumber(value) {
  return String(Math.round(value * 100) / 100);
}

function getBboxWidth(bbox) {
  return bbox[2] - bbox[0];
}

function getBboxHeight(bbox) {
  return bbox[3] - bbox[1];
}
