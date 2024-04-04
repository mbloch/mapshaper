import { El } from './gui-el';
import { EventDispatcher } from './gui-events';
import { internal, geom } from './gui-core';
import { translateDisplayPoint, isProjectedLayer } from './gui-display-utils';

export function HighlightBox(gui, optsArg) {
  var el = El('div').addClass('zoom-box').appendTo('body'),
      opts = Object.assign({
        name: 'box',
        handles: false,
        persistent: false,
        draggable: false  // does dragging the map draw a box
      }, optsArg),
      box = new EventDispatcher(),
      stroke = 2,
      activeHandle = null,
      prevXY = null,
      boxCoords = null,
      _on = false,
      _visible = false,
      handles;

  if (opts.classname) {
    el.addClass(opts.classname);
  }

  el.hide();

  gui.on('map_rendered', function() {
    if (!_on || !_visible) return;
    redraw();
  });

  gui.on('shift_drag', function(e) {
    if (!_on) return;
    if (!opts.draggable) return;
    boxCoords = getBoxCoords(e.data);
    redraw();
    box.dispatchEvent('drag');
  });

  gui.on('shift_drag_end', function(e) {
    if (!_on || !_visible || !opts.draggable) return;
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

    gui.map.getMouse().on('mousemove', function(e) {
      if (!_on || !activeHandle || !prevXY || !boxCoords || !_visible) return;
      var xy = {x: e.pageX, y: e.pageY};
      var scaling = gui.keyboard.shiftIsPressed() && activeHandle.type == 'corner';
      if (scaling) {
        rescaleBox(e.x, e.y);
      } else {
        resizeBox(xy.x - prevXY.x, xy.y - prevXY.y, activeHandle);
      }
      prevXY = xy;
      redraw();
      box.dispatchEvent('handle_drag');
    });

    gui.map.getMouse().on('mouseup', function(e) {
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

  function resizeBox(dx, dy, activeHandle) {
    var shifting = activeHandle.type == 'center';
    var centered = gui.keyboard.shiftIsPressed() && activeHandle.type == 'edge';
    var scale = gui.map.getExtent().getPixelSize();
    dx *= scale;
    dy *= -scale;

    if (activeHandle.col == 'left' || shifting) {
      boxCoords[0] += dx;
      if (centered) boxCoords[2] -= dx;
    }
    if (activeHandle.col == 'right' || shifting) {
      boxCoords[2] += dx;
      if (centered) boxCoords[0] -= dx;
    }
    if (activeHandle.row == 'top' || shifting) {
      boxCoords[3] += dy;
      if (centered) boxCoords[1] -= dy;
    }
    if (activeHandle.row == 'bottom' || shifting) {
      boxCoords[1] += dy;
      if (centered) boxCoords[3] -= dy;
    }
  }

  function rescaleBox(x, y) {
    var p = gui.map.getExtent().translatePixelCoords(x, y);
    var cx = (boxCoords[0] + boxCoords[2])/2;
    var cy = (boxCoords[1] + boxCoords[3])/2;
    var dist2 = geom.distance2D(cx, cy, p[0], p[1]);
    var dist = geom.distance2D(cx, cy, boxCoords[0], boxCoords[1]);
    var k = dist2 / dist;
    var dx = (boxCoords[2] - cx) * k;
    var dy = (boxCoords[3] - cy) * k;
    boxCoords = [cx - dx, cy - dy, cx + dx, cy + dy];
  }

  box.setDataCoords = function(bbox) {
    boxCoords = bbox;
    redraw();
  };

  box.getDataCoords = function() {
    if (!boxCoords) return null;
    var lyr = gui.map.getActiveLayer();
    var dataBox = lyr ? translateCoordsToLayerCRS(boxCoords, lyr) : translateCoordsToLatLon(boxCoords);
    fixBounds(dataBox);
    return dataBox;
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
    _visible = false;
  };

  box.show = function(x1, y1, x2, y2) {
    _visible = true;
    var w = Math.abs(x1 - x2),
        h = Math.abs(y1 - y2),
        props = {
          top: Math.min(y1, y2),
          left: Math.min(x1, x2),
          width: Math.max(w - stroke / 2, 1),
          height: Math.max(h - stroke / 2, 1)
        };
    el.css(props);
    el.show();
    if (handles) {
      showHandles(handles, props, x2 < x1, y2 < y1);
    }
  };

  function translateCoordsToLatLon(bbox) {
    var crs = gui.map.getDisplayCRS();
    var a = internal.toLngLat([bbox[0], bbox[1]], crs);
    var b = internal.toLngLat([bbox[2], bbox[3]], crs);
    return a.concat(b);
  }

  // bbox: display coords
  // intended to work with rectangular projections like Mercator
  function translateCoordsToLayerCRS(bbox, lyr) {
    if (!isProjectedLayer(lyr)) return bbox.concat();
    var a = translateDisplayPoint(lyr, [bbox[0], bbox[1]]);
    var b = translateDisplayPoint(lyr, [bbox[2], bbox[3]]);
    var bounds = new internal.Bounds();
    bounds.mergePoint(a[0], a[1]);
    bounds.mergePoint(b[0], b[1]);
    return bounds.toArray();
  }

  // get bbox coords in the display CRS
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
    // if (i == 4) continue; // skip middle handle
    var c = Math.floor(i / 3);
    var r = i % 3;
    var type = i == 4 && 'center' || c != 1 && r != 1 && 'corner' || 'edge';
    handles.push({
      el: El('div').addClass('handle').appendTo(el),
      type: type,
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


