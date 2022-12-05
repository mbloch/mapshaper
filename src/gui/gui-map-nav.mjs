import { MouseWheel } from './gui-mouse';
import { Tween } from './gui-tween';
import { Bounds, internal, utils } from './gui-core';
import { initVariableClick } from './gui-mouse-utils';
import { HighlightBox } from './gui-highlight-box';

export function MapNav(gui, ext, mouse) {
  var wheel = new MouseWheel(mouse),
      zoomTween = new Tween(Tween.sineInOut),
      zoomBox = new HighlightBox(gui), // .addClass('zooming'),
      boxDrag = false,
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
    inBtn = gui.buttons.addButton("#zoom-in-icon");
    outBtn = gui.buttons.addButton("#zoom-out-icon");
    initVariableClick(inBtn.node(), zoomIn);
    initVariableClick(outBtn.node(), zoomOut);
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

  mouse.on('click', function(e) {
    gui.dispatchEvent('map_click', e);
  });

  mouse.on('dblclick', function(e) {
    if (disabled()) return;
    zoomByPct(getZoomInPct(), e.x / ext.width(), e.y / ext.height());
  });

  mouse.on('dragstart', function(e) {
    if (disabled()) return;
    if (!internal.layerHasGeometry(gui.model.getActiveLayer().layer)) return;
    // zoomDrag = !!e.metaKey || !!e.ctrlKey; // meta is command on mac, windows key on windows
    boxDrag = !!e.shiftKey;
    if (boxDrag) {
      if (useBoxZoom()) zoomBox.turnOn();
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
      zoomBox.turnOff();
    }
  });

  zoomBox.on('dragend', function(e) {
    zoomToBbox(e.map_bbox);
  });

  wheel.on('mousewheel', function(e) {
    var tickFraction = 0.11; // 0.15; // fraction of zoom step per wheel event;
    var k = 1 + (tickFraction * e.multiplier * zoomScaleMultiplier),
        delta = e.direction > 0 ? k : 1 / k;
    if (disabled()) return;
    ext.zoomByPct(delta, e.x / ext.width(), e.y / ext.height());
  });

  function useBoxZoom() {
    return gui.getMode() != 'selection_tool' && gui.getMode() != 'box_tool';
  }

  function getBoxData(e) {
    return {
      a: [e.x, e.y],
      b: [dragStartEvt.x, dragStartEvt.y]
    };
  }

  function disabled() {
    return !!gui.options.disableNavigation;
  }

  function zoomIn(e) {
    if (disabled()) return;
    zoomByPct(getZoomInPct(e.time), 0.5, 0.5);
  }

  function zoomOut(e) {
    if (disabled()) return;
    zoomByPct(1/getZoomInPct(e.time), 0.5, 0.5);
  }

  function getZoomInPct(clickTime) {
    var minScale = 0.2,
        maxScale = 4,
        minTime = 100,
        maxTime = 800,
        time = utils.clamp(clickTime || 200, minTime, maxTime),
        k = (time - minTime) / (maxTime - minTime),
        scale = minScale + k * (maxScale - minScale);
    return 1 + scale * zoomScaleMultiplier;
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
