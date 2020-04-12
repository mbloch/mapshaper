import { MouseWheel } from './gui-mouse';
import { Tween } from './gui-tween';
import { Bounds, internal } from './gui-core';

export function MapNav(gui, ext, mouse) {
  var wheel = new MouseWheel(mouse),
      zoomTween = new Tween(Tween.sineInOut),
      boxDrag = false,
      zoomScale = 1.5,
      zoomScaleMultiplier = 1,
      inBtn, outBtn,
      dragStartEvt,
      _fx, _fy; // zoom foci, [0,1]

  this.setZoomFactor = function(k) {
    zoomScaleMultiplier = k || 1;
  };

  this.zoomToBbox = zoomToBbox;

  if (gui.options.homeControl) {
    gui.buttons.addButton("#home-icon").on('click', function() {
      if (disabled()) return;
      gui.dispatchEvent('map_reset');
    });
  }

  if (gui.options.zoomControl) {
    inBtn = gui.buttons.addButton("#zoom-in-icon").on('click', zoomIn);
    outBtn = gui.buttons.addButton("#zoom-out-icon").on('click', zoomOut);
    ext.on('change', function() {
      inBtn.classed('disabled', ext.scale() >= ext.maxScale());
    });
  }

  gui.on('map_reset', function() {
    ext.home();
  });

  zoomTween.on('change', function(e) {
    ext.zoomToExtent(e.value, _fx, _fy);
  });

  mouse.on('dblclick', function(e) {
    if (disabled()) return;
    zoomByPct(1 + zoomScale * zoomScaleMultiplier, e.x / ext.width(), e.y / ext.height());
  });

  mouse.on('dragstart', function(e) {
    if (disabled()) return;
    if (!internal.layerHasGeometry(gui.model.getActiveLayer().layer)) return;
    // zoomDrag = !!e.metaKey || !!e.ctrlKey; // meta is command on mac, windows key on windows
    boxDrag = !!e.shiftKey;
    if (boxDrag) {
      dragStartEvt = e;
      gui.dispatchEvent('box_drag_start');
    }
  });

  mouse.on('drag', function(e) {
    if (disabled()) return;
    if (boxDrag) {
      gui.dispatchEvent('box_drag', getBoxData(e));
    } else {
      ext.pan(e.dx, e.dy);
    }
  });

  mouse.on('dragend', function(e) {
    var bbox;
    if (disabled()) return;
    if (boxDrag) {
      boxDrag = false;
      gui.dispatchEvent('box_drag_end', getBoxData(e));
    }
  });

  wheel.on('mousewheel', function(e) {
    var tickFraction = 0.11; // 0.15; // fraction of zoom step per wheel event;
    var k = 1 + (tickFraction * e.multiplier * zoomScaleMultiplier),
        delta = e.direction > 0 ? k : 1 / k;
    if (disabled()) return;
    ext.zoomByPct(delta, e.x / ext.width(), e.y / ext.height());
  });

  function swapElements(arr, i, j) {
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  function getBoxData(e) {
    var pageBox = [e.pageX, e.pageY, dragStartEvt.pageX, dragStartEvt.pageY];
    var mapBox = [e.x, e.y, dragStartEvt.x, dragStartEvt.y];
    var tmp;
    if (pageBox[0] > pageBox[2]) {
      swapElements(pageBox, 0, 2);
      swapElements(mapBox, 0, 2);
    }
    if (pageBox[1] > pageBox[3]) {
      swapElements(pageBox, 1, 3);
      swapElements(mapBox, 1, 3);
    }
    return {
      map_bbox: mapBox,
      page_bbox: pageBox
    };
  }

  function disabled() {
    return !!gui.options.disableNavigation;
  }

  function zoomIn() {
    if (disabled()) return;
    zoomByPct(1 + zoomScale * zoomScaleMultiplier, 0.5, 0.5);
  }

  function zoomOut() {
    if (disabled()) return;
    zoomByPct(1/(1 + zoomScale * zoomScaleMultiplier), 0.5, 0.5);
  }

  // @box Bounds with pixels from t,l corner of map area.
  function zoomToBbox(bbox) {
    var bounds = new Bounds(bbox),
        pct = Math.max(bounds.width() / ext.width(), bounds.height() / ext.height()),
        fx = bounds.centerX() / ext.width() * (1 + pct) - pct / 2,
        fy = bounds.centerY() / ext.height() * (1 + pct) - pct / 2;
    zoomByPct(1 / pct, fx, fy);
  }

  // @pct Change in scale (2 = 2x zoom)
  // @fx, @fy zoom focus, [0, 1]
  function zoomByPct(pct, fx, fy) {
    var w = ext.getBounds().width();
    _fx = fx;
    _fy = fy;
    zoomTween.start(w, w / pct, 400);
  }
}
