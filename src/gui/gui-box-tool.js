/* @requires gui-highlight-box */

function BoxTool(gui, ext, nav, hit) {
  var self = new EventDispatcher();
  var box = new HighlightBox('body');
  var _on = false;
  var bbox, bboxPixels;
  var popup = gui.container.findChild('.box-tool-options');
  var coords = popup.findChild('.box-coords');

  var infoBtn = new SimpleButton(popup.findChild('.info-btn')).on('click', function() {
    toggleCoords();
  });

  new SimpleButton(popup.findChild('.cancel-btn')).on('click', gui.clearMode);

  new SimpleButton(popup.findChild('.zoom-btn')).on('click', zoomToBox);

  new SimpleButton(popup.findChild('.select-btn')).on('click', function() {
    showSelection();
  });

  // Removing button for creating a layer containing a single rectangle.
  // You can get the bbox with the Info button and create a rectangle in the console
  // using -rectangle bbox=<coordinates>
  // new SimpleButton(popup.findChild('.rectangle-btn')).on('click', function() {
  //   runCommand('-rectangle bbox=' + bbox.join(','));
  // });

  new SimpleButton(popup.findChild('.clip-btn')).on('click', function() {
    runCommand('-clip bbox2=' + bbox.join(','));
  });

  // gui.keyboard.onMenuSubmit(popup, zoomToBox);

  function showSelection() {
    var active = gui.model.getActiveLayer();
    var ids = internal.findShapesIntersectingBBox(bbox, active.layer, active.dataset.arcs);
    if (!ids.length) return;
    gui.enterMode('selection_tool');
    gui.interaction.setMode('selection');
    gui.interaction.setActive(true);
    hit.addSelectionIds(ids);
  }

  function runCommand(cmd) {
    if (gui.console) gui.console.runMapshaperCommands(cmd, function(err) {});
    gui.clearMode();
  }

  function toggleCoords() {
    if (coords.visible()) hideCoords(); else showCoords();
  }

  function showCoords() {
    El(infoBtn.node()).addClass('selected-btn');
    coords.text(bbox.join(','));
    coords.show();
    GUI.selectElement(coords.node());
  }

  function hideCoords() {
    El(infoBtn.node()).removeClass('selected-btn');
    coords.hide();
  }

  function zoomToBox() {
    nav.zoomToBbox(bboxPixels);
    gui.clearMode();
  }

  function turnOn() {
    _on = true;
  }

  function turnOff() {
    _on = false;
    box.hide();
    popup.hide();
    hideCoords();
  }

  function bboxToCoords(bbox) {
    var a = ext.translatePixelCoords(bbox[0], bbox[1]);
    var b = ext.translatePixelCoords(bbox[2], bbox[3]);
    return [a[0], b[1], b[0], a[1]];
  }

  function bboxToPixels(bbox) {
    var a = ext.translateCoords(bbox[0], bbox[1]);
    var b = ext.translateCoords(bbox[2], bbox[3]);
    return [a[0], b[1], b[0], a[1]];
  }

  ext.on('change', function() {
    if (!_on) return;
    var b = bboxToPixels(bbox);
    var pos = ext.position();
    var dx = pos.pageX,
        dy = pos.pageY;
    box.show(b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy);
  });

  gui.addMode('box_tool', turnOn, turnOff);

  gui.on('box_drag_start', function() {
    hideCoords();
    if (internal.layerHasGeometry(gui.model.getActiveLayer().layer)) {
      gui.enterMode('box_tool');
    }
  });

  gui.on('box_drag', function(e) {
    if (!_on) return;
    var b = e.page_bbox;
    box.show(b[0], b[1], b[2], b[3]);
  });

  gui.on('box_drag_end', function(e) {
    if (!_on) return;
    bboxPixels = e.map_bbox;
    bbox = bboxToCoords(bboxPixels);
    // round coords, for nicer 'info' display
    // (rounded precision should be sub-pixel)
    bbox = internal.getRoundedCoords(bbox, internal.getBoundsPrecisionForDisplay(bbox));
    popup.show();
  });

  return self;
}
