import { El } from './gui-el';
import { EventDispatcher } from './gui-events';
import { getBBoxCoords } from './gui-display-utils';
import { internal } from './gui-core';

export function HighlightBox(gui, optsArg) {
  var el = El('div').addClass('zoom-box').appendTo('body'),
      opts = Object.assign({handles: false, persistent: false}, optsArg),
      box = new EventDispatcher(),
      stroke = 2,
      activeHandle = null,
      prevXY = null,
      boxCoords = null,
      _on = false,
      handles;

  el.hide();

  gui.on('map_rendered', function() {
    if (!_on) return;
    redraw();
  });

  gui.on('box_drag', function(e) {
    if (!_on) return;
    boxCoords = getBoxCoords(e.data);
    redraw();
    box.dispatchEvent('drag');
  });

  gui.on('box_drag_end', function(e) {
    if (!_on) return;
    boxCoords = getBoxCoords(e.data);
    var pix = coordsToPix(boxCoords, gui.map.getExtent());
    box.dispatchEvent('dragend', {map_bbox: pix});
    if (!opts.persistent) {
      box.hide();
    } else {
      redraw();
    }
  });

  if (opts.handles) {
    handles = initHandles(el);
    handles.forEach(function(handle) {
      handle.el.on('mousedown', function(e) {
        activeHandle = handle;
        activeHandle.el.css('background', 'black');
        prevXY = {x: e.pageX, y: e.pageY};
      });
    });

    document.addEventListener('mousemove', function(e) {
      if (!_on || !activeHandle || !prevXY || !boxCoords) return;
      var xy = {x: e.pageX, y: e.pageY};
      var scale = gui.map.getExtent().getPixelSize();
      var dx = (xy.x - prevXY.x) * scale;
      var dy = -(xy.y - prevXY.y) * scale;
      if (activeHandle.col == 'left') {
        boxCoords[0] += dx;
      } else if (activeHandle.col == 'right') {
        boxCoords[2] += dx;
      }
      if (activeHandle.row == 'top') {
        boxCoords[3] += dy;
      } else if (activeHandle.row == 'bottom') {
        boxCoords[1] += dy;
      }
      prevXY = xy;
      redraw();
      box.dispatchEvent('handle_drag');
    });

    document.addEventListener('mouseup', function() {
      if (activeHandle && _on) {
        activeHandle.el.css('background', null);
        activeHandle = null;
        prevXY = null;
        box.dispatchEvent('handle_up');
        // reset box if it has been inverted (by dragging)
        fixBounds(boxCoords);
        redraw();
      }
    });
  }

  box.getDataCoords = function() {
    if (!boxCoords) return null;
    var dataBox = getBBoxCoords(gui.map.getActiveLayer(), boxCoords);
    fixBounds(dataBox);
    return internal.getRoundedCoords(dataBox, internal.getBoundsPrecisionForDisplay(dataBox));
  };

  box.turnOn = function() {
    _on = true;
  };

  box.turnOff = function() {
    _on = false;
  };

  box.hide = function() {
    el.hide();
    boxCoords = null;
  };

  box.show = function(x1, y1, x2, y2) {
    var w = Math.abs(x1 - x2),
        h = Math.abs(y1 - y2),
        props = {
          top: Math.min(y1, y2),
          left: Math.min(x1, x2),
          width: Math.max(w - stroke * 2, 1),
          height: Math.max(h - stroke * 2, 1)
        };
    el.css(props);
    el.show();
    if (handles) {
      showHandles(handles, props, x2 < x1, y2 < y1);
    }
  };

  function getBoxCoords(e) {
    var bbox = pixToCoords(e.a.concat(e.b), gui.map.getExtent());
    fixBounds(bbox);
    return bbox;
  }

  function redraw() {
    if (!boxCoords) return;
    var ext = gui.map.getExtent();
    var b = coordsToPix(boxCoords, ext);
    var pos = ext.position();
    var dx = pos.pageX,
        dy = pos.pageY;
    box.show(b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy);
  }

  return box;
}

function coordsToPix(bbox, ext) {
  var a = ext.translateCoords(bbox[0], bbox[1]);
  var b = ext.translateCoords(bbox[2], bbox[3]);
  return [Math.round(a[0]), Math.round(b[1]), Math.round(b[0]), Math.round(a[1])];
}

function pixToCoords(bbox, ext) {
  var a = ext.translatePixelCoords(bbox[0], bbox[1]);
  var b = ext.translatePixelCoords(bbox[2], bbox[3]);
  return [a[0], b[1], b[0], a[1]];
}


function fixBounds(bbox) {
  var tmp;
  if (bbox[0] > bbox[2]) {
    tmp = bbox[0];
    bbox[0] = bbox[2];
    bbox[2] = tmp;
  }
  if (bbox[1] > bbox[3]) {
    tmp = bbox[1];
    bbox[1] = bbox[3];
    bbox[3] = tmp;
  }
}

function initHandles(el) {
  var handles = [];
  for (var i=0; i<9; i++) {
    if (i == 4) continue;
    var c = Math.floor(i / 3);
    var r = i % 3;
    handles.push({
      el: El('div').addClass('handle').appendTo(el),
      col: c == 0 && 'left' || c == 1 && 'center' || 'right',
      row: r == 0 && 'top' || r == 1 && 'center' || 'bottom'
    });
  }
  return handles;
}

function showHandles(handles, props, xinv, yinv) {
  var scaledSize = Math.ceil(Math.min(props.width, props.height) / 3) - 1;
  var HANDLE_SIZE = Math.min(scaledSize, 7);
  var OFFS = Math.floor(HANDLE_SIZE / 2) + 1;
  handles.forEach(function(handle) {
    var top = 0,
        left = 0;
    if (handle.col == 'center') {
      left += props.width / 2 - HANDLE_SIZE / 2;
    } else if (handle.col == 'left' && xinv || handle.col == 'right' && !xinv) {
      left += props.width - HANDLE_SIZE + OFFS;
    } else {
      left -= OFFS;
    }
    if (handle.row == 'center') {
      top += props.height / 2 - HANDLE_SIZE / 2;
    } else if (handle.row == 'top' && yinv || handle.row == 'bottom' && !yinv) {
      top += props.height - HANDLE_SIZE + OFFS;
    } else {
      top -= OFFS;
    }

    handle.el.css({
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
      top: top,
      left: left
    });
  });
}


