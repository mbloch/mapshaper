import { HighlightBox } from './gui-highlight-box';
import { EventDispatcher } from './gui-events';
import { SimpleButton } from './gui-elements';
import { internal } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { getBBoxCoords } from './gui-display-utils';

// Controls the shift-drag box editing tool
//
export function BoxTool(gui, ext, nav) {
  var self = new EventDispatcher();
  var box = new HighlightBox(gui, {persistent: true, handles: true});
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
    if (!coords) return;
    gui.enterMode('selection_tool');
    gui.interaction.setMode('selection');
    // kludge to pass bbox to the selection tool
    gui.dispatchEvent('selection_bridge', {
      map_data_bbox: coords
    });
  });

  new SimpleButton(popup.findChild('.clip-btn')).on('click', function() {
    runCommand('-clip bbox=' + box.getDataCoords().join(','));
  });

  new SimpleButton(popup.findChild('.erase-btn')).on('click', function() {
    runCommand('-erase bbox=' + box.getDataCoords().join(','));
  });

  new SimpleButton(popup.findChild('.rect-btn')).on('click', function() {
    runCommand('-rectangle + bbox=' + box.getDataCoords().join(','));
  });

  gui.addMode('box_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode === 'box') {
      gui.enterMode('box_tool');
    } else if (gui.getMode() == 'box_tool') {
      gui.clearMode();
    }
  });

  gui.on('box_drag_start', function() {
    // box.classed('zooming', inZoomMode());
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
    coords.text(box.getDataCoords().join(','));
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

  return self;
}
