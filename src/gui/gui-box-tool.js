/* @requires gui-highlight-box */

function BoxTool(gui, ext, nav) {
  var box = new HighlightBox('body');
  var _on = false;
  var bbox, bboxPixels;
  var popup = gui.container.findChild('.box-tool-options');

  gui.keyboard.onMenuSubmit(popup, zoomToBox);

  new SimpleButton(popup.findChild('.cancel-btn')).on('click', gui.clearMode);

  new SimpleButton(popup.findChild('.zoom-btn').addClass('default-btn')).on('click', zoomToBox);

  new SimpleButton(popup.findChild('.clip-btn')).on('click', function() {
    var cmd = '-clip bbox=' + bbox.join(',');
    if (gui.console) gui.console.runMapshaperCommands(cmd, function(err) {
      //
    });
    gui.clearMode();
  });

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
    if (internal.layerHasGeometry(gui.model.getActiveLayer().layer)) {
      gui.enterMode('box_tool');
    }
  });

  gui.on('box_drag', function(e) {
    var b = e.page_bbox;
    box.show(b[0], b[1], b[2], b[3]);
  });

  gui.on('box_drag_end', function(e) {
    bboxPixels = e.map_bbox;
    bbox = bboxToCoords(bboxPixels);
    popup.show();
  });
}
