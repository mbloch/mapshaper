import { HighlightBox } from './gui-highlight-box';
import { EventDispatcher } from './gui-events';
import { SimpleButton } from './gui-elements';
import { internal } from './gui-core';
import { El } from './gui-el';
import { GUI } from './gui-lib';
import { getBBoxCoords } from './gui-display-layer';

// Controls both the shift-drag zoom-to-extent tool and the shift-drag editing tool

export function BoxTool(gui, ext, mouse, nav) {
  var self = new EventDispatcher();
  var box = new HighlightBox();
  var popup = gui.container.findChild('.box-tool-options');
  var coords = popup.findChild('.box-coords');
  var _on = false;
  var bboxDisplayCoords, bboxPixels, bboxDataCoords;

  var infoBtn = new SimpleButton(popup.findChild('.info-btn')).on('click', function() {
    if (coords.visible()) hideCoords(); else showCoords();
  });

  new SimpleButton(popup.findChild('.cancel-btn')).on('click', function() {
    reset();
  });

  // Removing zoom-in button -- cumbersome way to zoom
  // new SimpleButton(popup.findChild('.zoom-btn')).on('click', function() {
  //   nav.zoomToBbox(bboxPixels);
  //   reset();
  // });

  // Removing button for creating a layer containing a single rectangle.
  // You can get the bbox with the Info button and create a rectangle in the console
  // using -rectangle bbox=<coordinates>
  // new SimpleButton(popup.findChild('.rectangle-btn')).on('click', function() {
  //   runCommand('-rectangle bbox=' + bbox.join(','));
  // });

  new SimpleButton(popup.findChild('.select-btn')).on('click', function() {
    gui.enterMode('selection_tool');
    gui.interaction.setMode('selection');
    // kludge to pass bbox to the selection tool
    gui.dispatchEvent('box_drag_end', {map_bbox: bboxPixels});
  });

  new SimpleButton(popup.findChild('.clip-btn')).on('click', function() {
    runCommand('-clip bbox2=' + bboxDataCoords.join(','));
  });

  gui.addMode('box_tool', turnOn, turnOff);

  gui.on('interaction_mode_change', function(e) {
    if (e.mode === 'box') {
      gui.enterMode('box_tool');
    } else if (gui.getMode() == 'box_tool') {
      gui.clearMode();
    }
  });

  // Update the visible rectangle when the map view changes
  // (e.g. during zooming or panning)
  ext.on('change', function() {
    if (!_on || !box.visible() || !bboxDisplayCoords) return;
    var b = coordsToPix(bboxDisplayCoords);
    var pos = ext.position();
    var dx = pos.pageX,
        dy = pos.pageY;
    box.show(b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy);
  });

  gui.on('box_drag_start', function() {
    box.classed('zooming', inZoomMode());
    hideCoords();
  });

  gui.on('box_drag', function(e) {
    var b = e.page_bbox;
    bboxPixels = e.map_bbox;
    bboxDisplayCoords = pixToCoords(bboxPixels);
    if (_on || inZoomMode()) {
      box.show(b[0], b[1], b[2], b[3]);
    }
  });

  gui.on('box_drag_end', function(e) {
    bboxPixels = e.map_bbox;
    bboxDisplayCoords = pixToCoords(bboxPixels);
    bboxDataCoords = getBBoxCoords(gui.map.getActiveLayer(), bboxDisplayCoords);
    if (inZoomMode()) {
      box.hide();
      nav.zoomToBbox(bboxPixels);
    } else if (_on) {
      popup.show();
    }
  });

  function inZoomMode() {
    return !_on && gui.getMode() != 'selection_tool';
  }

  function runCommand(cmd) {
    if (gui.console) {
      gui.console.runMapshaperCommands(cmd, function(err) {
        reset();
      });
    }
    // reset(); // TODO: exit interactive mode
  }

  function showCoords() {
    El(infoBtn.node()).addClass('selected-btn');
    coords.text(bboxDataCoords.join(','));
    coords.show();
    GUI.selectElement(coords.node());
  }

  function hideCoords() {
    El(infoBtn.node()).removeClass('selected-btn');
    coords.hide();
  }

  function turnOn() {
    _on = true;
  }

  function turnOff() {
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

  function pixToCoords(bbox) {
    var a = ext.translatePixelCoords(bbox[0], bbox[1]);
    var b = ext.translatePixelCoords(bbox[2], bbox[3]);
    var bbox2 = [a[0], b[1], b[0], a[1]];
    // round coords, for nicer 'info' display
    // (rounded precision should be sub-pixel)
    return internal.getRoundedCoords(bbox2, internal.getBoundsPrecisionForDisplay(bbox2));
  }

  function coordsToPix(bbox) {
    var a = ext.translateCoords(bbox[0], bbox[1]);
    var b = ext.translateCoords(bbox[2], bbox[3]);
    return [a[0], b[1], b[0], a[1]];
  }

  return self;
}
