import { HighlightBox } from './gui-highlight-box';
import { EventDispatcher } from './gui-events';
import { SimpleButton } from './gui-elements';
import { internal } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { showPopupAlert } from './gui-alert';
import { getNewFrameName } from './gui-layer-utils';

// Controls the shift-drag box editing tool
//
export function BoxTool(gui, ext, nav) {
  var self = new EventDispatcher();
  var box = new HighlightBox(gui, {name: 'box-tool', persistent: true, handles: true, draggable: true});
  var popup = gui.container.findChild('.box-tool-options');
  var coords = popup.findChild('.box-coords').hide();
  var selectBtn = popup.findChild('.select-btn');
  var clipBtn = popup.findChild('.clip-btn');
  var eraseBtn = popup.findChild('.erase-btn');
  var _on = false;
  var instructionsShown = false;
  var alert;

  var infoBtn = new SimpleButton(popup.findChild('.info-btn')).on('click', function() {
    if (coords.visible()) hideCoords(); else showCoords();
  });

  new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
    reset();
  });

  new SimpleButton(selectBtn).on('click', function() {
    var coords = box.getDataCoords();
    if (!coords || noData()) return;
    gui.enterMode('selection_tool');
    gui.interaction.setMode('selection');
    // kludge to pass bbox to the selection tool
    gui.dispatchEvent('selection_bridge', {
      map_data_bbox: coords
    });
  });

  function noData() {
    return !gui.model.getActiveLayer();
  }

  new SimpleButton(clipBtn).on('click', function() {
    runCommand('-clip bbox=' + box.getDataCoords().join(','));
  });

  new SimpleButton(eraseBtn).on('click', function() {
    if (activeLayerIsRaster()) return;
    runCommand('-erase bbox=' + box.getDataCoords().join(','));
  });

  new SimpleButton(popup.findChild('.rect-btn')).on('click', function() {
    var cmd = '-rectangle + bbox=' + box.getDataCoords().join(',');
    runCommand(cmd);
  });

  var frameBtn = popup.findChild('.frame-btn');
  new SimpleButton(frameBtn).on('click', function() {
    openAddFramePopup(gui, box.getDataCoords());
  });

  // Only a box (or its options) on the map takes the key, so that Escape
  // still reaches other tools' handlers
  gui.keyboard.on('keydown', function(e) {
    if (e.keyName == 'esc' && (box.getDisplayCoords() || popup.visible())) {
      reset();
      e.stopPropagation();
    }
  }, null, 10);

  gui.addMode('box_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode === 'box') {
      gui.enterMode('box_tool');
      if (!instructionsShown) {
        instructionsShown = true;
        showInstructions();
      }
    } else if (_on) {
      gui.clearMode();
      turnOff();
    }
  });

  gui.on('shift_drag_start', function() {
    hideCoords();
  });

  box.on('dragend', function(e) {
    if (_on) {
      hideInstructions();
      updateOptionsForActiveLayer();
      popup.show();
    }
  });

  box.on('handle_drag', function() {
    if (coords.visible()) {
      showCoords();
    }
  });

  function showInstructions() {
    var msg = `Click to start a rectangle. Drag handles to resize. Press shift key to resize symmetrically.`;
    alert = showPopupAlert(msg, null, { non_blocking: true, max_width: '360px'});
  }

  function hideInstructions() {
    if (!alert) return;
    alert.close('fade');
    alert = null;
  }

  function inZoomMode() {
    return !_on && gui.getMode() != 'selection_tool';
  }

  function runCommand(cmd, onSuccess) {
    if (gui.console) {
      gui.console.runMapshaperCommands(cmd, function(err) {
        reset();
        gui.clearMode();
        if (!err && onSuccess) onSuccess();
      });
    }
    // reset(); // TODO: exit interactive mode
  }

  function showCoords() {
    El(infoBtn.node()).addClass('selected-btn');
    var bbox = box.getDataCoords();
    var rounded = internal.getRoundedCoords(bbox, internal.getBoundsPrecisionForDisplay(bbox));
    coords.text(rounded.join(','));
    coords.show();
    GUI.selectElement(coords.node());
  }

  function hideCoords() {
    El(infoBtn.node()).removeClass('selected-btn');
    coords.hide();
  }

  function turnOn() {
    box.turnOn();
    updateOptionsForActiveLayer();
    _on = true;
  }

  function turnOff() {
    box.turnOff();
    hideInstructions();
    if (gui.interaction.getMode() == 'box') {
      // mode change was not initiated by interactive menu -- turn off interactivity
      gui.interaction.turnOff();
    }
    _on = false;
    reset();
  }

  function reset() {
    box.hide();
    popup.hide();
    hideCoords();
  }

  function updateOptionsForActiveLayer() {
    var raster = activeLayerIsRaster();
    setButtonVisible(selectBtn, !raster);
    setButtonVisible(clipBtn, true);
    setButtonVisible(eraseBtn, !raster);
    // a frame is made from the layers of the unframed view
    setButtonVisible(frameBtn, !gui.model.getActiveFrame());
  }

  // The box is in the selected layer's CRS, so that layer is listed first; the
  // other visible layers become members too
  function getFrameTargetOption() {
    var active = gui.model.getActiveLayer().layer;
    var layers = [active].concat(gui.map.getCompositionLayers().filter(function(lyr) {
      return lyr != active;
    }));
    return 'target=' + internal.formatOptionValue(layers.map(function(lyr) {
      return internal.getLayerTargetId(gui.model, lyr);
    }).join(','));
  }

  function activeLayerIsRaster() {
    var active = gui.model.getActiveLayer();
    return !!(active && internal.layerHasRaster(active.layer));
  }

  function setButtonVisible(btn, visible) {
    btn.classed('hidden', !visible);
    if (visible) {
      btn.show();
    } else {
      btn.hide();
    }
  }

  function openAddFramePopup(gui, bbox) {
    var popup = showPopupAlert('', 'Add a map frame');
    var el = popup.container();
    el.addClass('option-menu');
    var html = `<p>Enter an output width in px, cm or inches.</p><div><input type="text" class="frame-width text-input" placeholder="examples: 600px 5in"></div>
    <div class="btn dialog-btn">Create</div></span>`;
    el.html(html);
    var input = el.findChild('.frame-width');
    input.node().focus();
    var btn = el.findChild('.btn').on('click', function() {
      var widthStr = input.node().value.trim();
      if (parseFloat(widthStr) > 0 === false) {
        // invalid input
        input.node().value = '';
        return;
      }
      var name = internal.formatOptionValue(getNewFrameName(gui.model));
      var cmd = `-frame bbox='${bbox.join(',')}' width='${widthStr}' name=${name} ${getFrameTargetOption()}`;
      runCommand(cmd, function() {
        if (gui.frameTool) gui.frameTool.open();
      });
      popup.close();
    });
  }

  return self;
}
