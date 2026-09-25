import { El } from './gui-el';
import { internal } from './gui-core';
import { runGuiEditCommand } from './gui-edit-command';
import { quoteCommandValue } from './gui-command-utils';
import { showPopupAlert } from './gui-alert';
import { translateDisplayPoint } from './gui-display-utils';
import { HighlightBox } from './gui-highlight-box';
import { FloatingToolbar } from './gui-floating-toolbar';
import { makePanelSection } from './gui-panel-controls';
import { parseFrameAspectRatio, formatFrameAspectRatio } from './gui-frame-aspect';

export function FrameResizeTool(gui) {
  var ext = gui.map.getExtent();
  var lockSize = false;
  var on = false;
  var drawing = false;
  var drawingRequested = false;
  var drawWidth = '800px';
  var drawAspect = '';
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
  // Named by what stays put, not by the action: changing the extent -- by
  // dragging a handle or by fitting -- is the same gesture either way, and all
  // that differs is which quantity absorbs it. Both labels stay visible so the
  // lit one reads as the current mode rather than as the result of a click.
  var sizeModeControl = toolbar.addSegmentedControl(null, [
    {value: 'scale', label: 'Fix scale',
      tooltip: 'Keep the map scale; the output gets bigger or smaller'},
    {value: 'output', label: 'Fix output',
      tooltip: 'Keep the output size; the map scale changes'}
  ], {classname: 'frame-size-mode'}).on('change', function(value) {
    setLockSize(value == 'output');
  });
  var aspectField = toolbar.addTextField('Ratio', {
    classname: 'frame-toolbar-aspect-input',
    placeholder: 'free',
    tooltip: 'Hold the frame to a shape: 16:9, 1.5, or blank for none'
  }).on('change', commitAspectRatio);
  toolbar.addSeparator();
  toolbar.addTextButton('Fit', {
    tooltip: 'Fit the frame to the visible layers'
  }).on('click', fitVisibleLayers);
  // Padding is spent on the fit rather than stored on the frame, so it sits
  // beside the button it modifies, as it does in the creation dialog.
  var marginField = toolbar.addTextField('Margin', {
    classname: 'frame-toolbar-margin-input',
    placeholder: '0',
    tooltip: 'Padding added when fitting: 20px, 1cm, ' +
      "or a percentage of the frame's width and height"
  });
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
  setLockSize(lockSize); // light the default segment

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

  // Resizing is a preview-mode gesture: the handles sit on the page boundary
  // that preview draws, so turning preview off leaves nothing to resize and
  // the tool has to close with it rather than stranding its toolbar and
  // handles over an ordinary map view.
  gui.on('preview_mode_change', function(e) {
    if (on && !e.enabled) gui.interaction.turnOff();
  });

  gui.model.on('update', function() {
    if (on) refreshOrClose();
  });

  gui.on('undo_redo_post', function() {
    if (on) refreshOrClose();
  });

  // Deleting the frame takes the tool's subject away. Preview mode drops
  // itself on the same event, but the order of model listeners is not a
  // contract worth relying on, so the tool checks for itself.
  function refreshOrClose() {
    if (!getFrameTarget()) {
      gui.interaction.turnOff();
    } else {
      syncFrameOverlay();
    }
  }

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
      drawBox.setAspectRatio(null);
      drawToolbar.hide();
      hideFrameDrawingInstructions();
      drawSource = null;
    }
  }

  function setLockSize(value) {
    lockSize = !!value;
    sizeModeControl.setValue(lockSize ? 'output' : 'scale');
  }

  function syncFrameOverlay() {
    var frame = gui.map.isPreviewView() && gui.map.getPreviewFrameData();
    if (frame) {
      frameBox.setDataCoords(frame.bbox.slice());
      // Only a frame with a fixed ratio constrains; otherwise the shape is
      // whatever the extent gives and the handles are free.
      frameBox.setAspectRatio(frame.aspect_ratio || null);
    } else {
      frameBox.hide();
    }
    syncAspectField();
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

  // Blank clears the fixed ratio and returns the frame to its extent's shape.
  // Anything that is not a ratio is refused and the field snaps back, rather
  // than quietly reshaping the frame to NaN.
  function commitAspectRatio(text) {
    var target = getFrameTarget();
    var value;
    if (!target) return;
    if (!text) {
      runAspectUpdate(target, 'auto-aspect');
      return;
    }
    value = parseFrameAspectRatio(text);
    if (!(value > 0)) {
      syncAspectField();
      return;
    }
    runAspectUpdate(target, 'aspect-ratio=' + value);
  }

  function runAspectUpdate(target, option) {
    runGuiEditCommand(gui, ['-update-frame', option, getTargetOption(target)]
      .join(' '), {
      title: 'Set frame aspect ratio',
      onError: syncAspectField
    });
  }

  // Shows the ratio the frame actually has, so a ratio typed as 3:2 reads back
  // as 3:2 and one the frame never took does not linger in the field.
  function syncAspectField() {
    var frame = gui.map.getPreviewFrameData();
    var aspect = frame && frame.aspect_ratio;
    aspectField.setValue(aspect > 0 ? formatFrameAspectRatio(aspect) : '');
  }

  // Fitting obeys the same mode as a handle drag: holding the scale grows the
  // output to cover the new extent, holding the output rescales onto it. The
  // command works out the extent, which has to leave room for symbols and
  // labels at the scale it ends up at, along with the padding and the
  // held-scale width, so the margin's unit handling lives in one place.
  function fitVisibleLayers() {
    var target = getFrameTarget();
    var entries = getCompositionEntries();
    var margin = getMargin();
    var parts;
    if (!target || !entries.length) return;
    parts = [
      '-update-frame',
      'fit=' + internal.formatOptionValue(entries.map(function(o) {
        return internal.getLayerTargetId(gui.model, o.layer);
      }).join(','))
    ];
    if (margin) parts.push('offset=' + quoteCommandValue(margin));
    if (!lockSize) parts.push('fix-scale');
    parts.push(getTargetOption(target));
    runGuiEditCommand(gui, parts.join(' '), {
      title: 'Fit map frame',
      onError: syncFrameOverlay
    });
  }

  // Anything that is not a positive length is dropped, and the field is
  // cleared so the fit that just ran matches what the toolbar shows.
  function getMargin() {
    var value = marginField.getValue();
    if (parseFloat(value) > 0) return value;
    if (value) marginField.setValue('');
    return '';
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
    var popup = showPopupAlert('', 'Add map frame', {classname: 'frame-create-box'});
    // label-style-panel is where the flat field look lives -- no bezel, and a
    // focus ring that is a border rather than a glow. frame-create-form turns
    // off the chrome the class also carries, as the properties panel does.
    var content = El('div').addClass('label-style-panel frame-create-form')
      .appendTo(popup.container().addClass('frame-create-popup'));
    El('p').appendTo(content)
      .text('Sets the size and crop of exported maps.');

    var widthInput = makeCreateField(content, 'Output width',
      'Width of the exported map.\nExamples: 800px, 5in, 10cm.')
      .addClass('frame-create-width-input');
    widthInput.node().value = '800px';

    var aspectInput = makeCreateField(content, 'Aspect ratio',
      'Width divided by height, as a number or\na ratio: 1.5 or 3:2. ' +
      'Leave blank to vary freely.')
      .addClass('frame-create-aspect-input');

    // Two ways to say where the frame goes. The heading is what makes them read
    // as a choice rather than as two loose actions; the margin sits on the row
    // it modifies, because it pads layer bounds and a drawn box is already the
    // extent the user meant.
    var section = makePanelSection(content, 'Frame area', {minor: true});
    var fitRow = El('div').addClass('frame-create-option-row').appendTo(section);
    addButton(fitRow, 'Fit visible layers', function() {
      var aspect = getAspect();
      if (aspect === null) return;
      popup.close();
      createFromVisibleLayers(getWidth(), aspect, getMargin());
    });
    var marginCell = El('label').addClass('frame-create-margin').appendTo(fitRow);
    El('span').appendTo(marginCell).text('Margin');
    var marginInput = El('input').attr('type', 'text').appendTo(marginCell);
    marginInput.node().value = '2%';
    makeFieldTip(fitRow,
      'Space around the layers: 2%, 20px, 1cm.\n' +
      "A percentage is of the frame's width on the\n" +
      'side and of its height on top and bottom.');

    var drawRow = El('div').addClass('frame-create-option-row').appendTo(section);
    addButton(drawRow, 'Draw on the map', function() {
      var aspect = getAspect();
      if (aspect === null) return;
      popup.close();
      beginFrameDrawing(getWidth(), aspect);
    });

    function getWidth() {
      var value = widthInput.node().value.trim();
      return parseFloat(value) > 0 ? value : '800px';
    }

    // Returns a ratio, '' when the field is blank -- the frame area then gives
    // the shape -- or null if the field holds something that is not a ratio, in
    // which case the dialog stays open on the bad value.
    function getAspect() {
      var text = aspectInput.node().value.trim();
      var value;
      if (!text) return '';
      value = parseFrameAspectRatio(text);
      if (!(value > 0)) {
        aspectInput.node().focus();
        return null;
      }
      return String(value);
    }

    function getMargin() {
      var value = marginInput.node().value.trim();
      return parseFloat(value) > 0 ? value : '';
    }
  }

  // A captioned field with a tip beside it. The caption and field are a label
  // so that clicking the caption focuses the field; the tip is outside it, or
  // opening the tip would focus the field too.
  function makeCreateField(parent, label, tip) {
    var row = El('div').addClass('frame-create-row').appendTo(parent);
    var cell = El('label').addClass('frame-field-row').appendTo(row);
    El('span').appendTo(cell).text(label);
    var input = El('input').attr('type', 'text').appendTo(cell);
    makeFieldTip(row, tip);
    return input;
  }

  function beginFrameDrawing(width, aspect) {
    drawSource = getSourceLayer();
    if (!drawSource) {
      showPopupAlert(
        'Add or select a geographic layer before creating a frame.',
        'Map frame'
      );
      return;
    }
    drawWidth = width;
    drawAspect = aspect || '';
    // Without this the box is drawn freehand and -frame silently pads it out to
    // the ratio, so the frame that appears is bigger than the one drawn.
    drawBox.setAspectRatio(drawAspect ? Number(drawAspect) : null);
    drawingRequested = true;
    gui.interaction.setMode('frame_draw');
  }

  function showFrameDrawingInstructions() {
    var text = 'Click to place the first corner, then click the opposite ' +
      'corner. Drag the handles to resize the frame.';
    if (drawAspect) {
      text += ' The box is held to ' +
        formatFrameAspectRatio(Number(drawAspect)) + '.';
    }
    drawInstructions = showPopupAlert(text, null,
      {non_blocking: true, max_width: '380px'});
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
    var parts = [
      '-frame',
      'bbox=' + quoteCommandValue(bbox.join(',')),
      'width=' + quoteCommandValue(drawWidth)
    ];
    if (drawAspect) parts.push('aspect-ratio=' + drawAspect);
    parts.push('name=frame');
    parts.push('target=' +
      internal.formatOptionValue(internal.getLayerTargetId(gui.model, source)));
    runCreateCommand(parts.join(' '));
  }

  function createFromVisibleLayers(width, aspect, margin) {
    var entries = getCompositionEntries();
    if (!entries.length) {
      showPopupAlert('No visible geographic layers are available.', 'Map frame');
      return;
    }
    var ids = entries.map(function(o) {
      return internal.getLayerTargetId(gui.model, o.layer);
    });
    var parts = ['-frame', 'width=' + quoteCommandValue(width)];
    if (aspect) parts.push('aspect-ratio=' + aspect);
    if (margin) parts.push('offset=' + quoteCommandValue(margin));
    parts.push('name=frame');
    parts.push('target=' + internal.formatOptionValue(ids.join(',')));
    runCreateCommand(parts.join(' '));
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

// The "?" the rest of the app uses for field help (see .tip-button in
// elements.css and the static ones in index.html). The bubble is white-space:
// pre, so the line breaks in the text are the ones it gets.
function makeFieldTip(parent, text) {
  var btn = El('div').addClass('tip-button').appendTo(parent).text('?');
  var anchor = El('div').addClass('tip-anchor').appendTo(btn);
  El('div').addClass('tip').appendTo(anchor).text(text);
  return btn;
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
