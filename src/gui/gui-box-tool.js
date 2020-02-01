/* @requires gui-highlight-box */

function BoxTool(gui, ext, nav) {
  var self = new EventDispatcher();
  var box = new HighlightBox('body');
  var _on = false;
  var bbox, bboxPixels;
  var popup = gui.container.findChild('.box-tool-options');
  var coords = popup.findChild('.box-coords');
  var _selection = null;

  // gui.keyboard.onMenuSubmit(popup, zoomToBox);
  clearSelection(); // hide selection buttons

  new SimpleButton(popup.findChild('.cancel-btn')).on('click', gui.clearMode);

  new SimpleButton(popup.findChild('.zoom-btn')).on('click', zoomToBox);

  new SimpleButton(popup.findChild('.info-btn')).on('click', function() {
    toggleCoords();
  });

  new SimpleButton(popup.findChild('.select-btn')).on('click', function() {
    updateSelection();
  });

  new SimpleButton(popup.findChild('.delete-btn')).on('click', function() {
    if (!_selection) return;
    var cmd = '-filter "' + JSON.stringify(_selection) + '.indexOf(this.id) == -1"';
    runCommand(cmd);
    clearSelection();
  });

  new SimpleButton(popup.findChild('.filter-btn')).on('click', function() {
    if (!_selection) return;
    var cmd = '-filter "' + JSON.stringify(_selection) + '.indexOf(this.id) > -1"';
    runCommand(cmd);
    clearSelection();
  });

  new SimpleButton(popup.findChild('.split-btn')).on('click', function() {
    if (!_selection) return;
    var cmd = '-each "split_name = ' + JSON.stringify(_selection) +
      '.indexOf(this.id) == -1 ? \'1\' : \'2\'" -split split_name';
    runCommand(cmd);
    clearSelection();
  });

  // new SimpleButton(popup.findChild('.rectangle-btn')).on('click', function() {
  //   runCommand('-rectangle bbox=' + bbox.join(','));
  // });

  new SimpleButton(popup.findChild('.clip-btn')).on('click', function() {
    runCommand('-clip bbox2=' + bbox.join(','));
  });

  function updateSelection() {
    var active = gui.model.getActiveLayer();
    var ids = internal.findShapesIntersectingBBox(bbox, active.layer, active.dataset.arcs);
    if (ids.length) showSelection(ids);
    else clearSelection();
  }

  function showSelection(ids) {
    var data = {ids: ids, id: ids.length ? ids[0] : -1, pinned: false};
    _selection = ids;
    box.hide();
    self.dispatchEvent('selection', data);
    popup.findChild('.default-group').hide();
    popup.findChild('.selection-group').css('display', 'inline-block');
  }

  function clearSelection() {
    popup.findChild('.default-group').css('display', 'inline-block');
    popup.findChild('.selection-group').hide();
    if (_selection) {
      _selection = null;
      self.dispatchEvent('selection', {ids: [], id: -1});
    }
  }

  function runCommand(cmd) {
    if (gui.console) gui.console.runMapshaperCommands(cmd, function(err) {});
    gui.clearMode();
  }

  function toggleCoords() {
    if (coords.visible()) {
      hideCoords();
    } else {
      coords.text(bbox.join(','));
      coords.show();
      GUI.selectElement(coords.node());
    }
  }

  function hideCoords() {
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
    clearSelection();
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
    if (!_on || _selection) return;
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
    var b = e.page_bbox;
    box.show(b[0], b[1], b[2], b[3]);
  });

  gui.on('box_drag_end', function(e) {
    var decimals;
    bboxPixels = e.map_bbox;
    bbox = bboxToCoords(bboxPixels);
    // round coords, for nicer 'info' display
    // (rounded precision should be sub-pixel)
    bbox = internal.getRoundedCoords(bbox, internal.getBoundsPrecisionForDisplay(bbox));
    if (_selection) {
      updateSelection();
    } else {
      popup.show();
    }
  });

  return self;
}
