import { HighlightBox } from './gui-highlight-box';
import { EventDispatcher } from './gui-events';
import { SimpleButton } from './gui-elements';
import { internal } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { showPopupAlert } from './gui-alert';

// Controls the shift-drag box editing tool
//
export function BoxTool(gui, ext, nav) {
  var self = new EventDispatcher();
  var box = new HighlightBox(gui, {name: 'box-tool', persistent: true, handles: true, draggable: true});
  var popup = gui.container.findChild('.box-tool-options');
  var coords = popup.findChild('.box-coords');
  var _on = false;

  var infoBtn = new SimpleButton(popup.findChild('.info-btn')).on('click', function() {
    if (coords.visible()) hideCoords(); else showCoords();
  });

  new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
    reset();
  });

  new SimpleButton(popup.findChild('.select-btn')).on('click', function() {
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

  new SimpleButton(popup.findChild('.clip-btn')).on('click', function() {
    runCommand('-clip bbox=' + box.getDataCoords().join(','));
  });

  new SimpleButton(popup.findChild('.erase-btn')).on('click', function() {
    runCommand('-erase bbox=' + box.getDataCoords().join(','));
  });

  new SimpleButton(popup.findChild('.rect-btn')).on('click', function() {
    var cmd = '-rectangle + bbox=' + box.getDataCoords().join(',');
    runCommand(cmd);
  });

  new SimpleButton(popup.findChild('.frame-btn')).on('click', function() {
    openAddFramePopup(gui, box.getDataCoords());
  });

  gui.addMode('box_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode === 'box') {
      gui.enterMode('box_tool');
    } else if (_on) {
      turnOff();
    }
  });

  gui.on('shift_drag_start', function() {
    hideCoords();
  });

  box.on('dragend', function(e) {
    if (_on) popup.show();
  });

  box.on('handle_drag', function() {
    if (coords.visible()) {
      showCoords();
    }
  });

  function inZoomMode() {
    return !_on && gui.getMode() != 'selection_tool';
  }

  function runCommand(cmd) {
    if (gui.console) {
      gui.console.runMapshaperCommands(cmd, function(err) {
        reset();
        gui.clearMode();
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
    _on = true;
  }

  function turnOff() {
    box.turnOff();
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

  function openAddFramePopup(gui, bbox) {
    var popup = showPopupAlert('', 'Add a map frame');
    var el = popup.container();
    el.addClass('option-menu');
    var html = `<p>Enter a width in px, cm or inches to create a frame layer
for setting the size of the map for symbol scaling in the
GUI and setting the size and crop of SVG output.</p><div><input type="text" class="frame-width text-input" placeholder="examples: 600px 5in"></div>
    <div tabindex="0" class="btn dialog-btn">Create</div></span>`;
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
      var cmd = `-rectangle + name=frame bbox='${bbox.join(',')}' width='${widthStr}'`;
      runCommand(cmd);
      popup.close();
    });
  }

  return self;
}
