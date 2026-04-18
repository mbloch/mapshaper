import { drawOutlineLayerToCanvas, drawStyledLayerToCanvas, DisplayCanvas } from './gui-canvas';
import { SvgDisplayLayer } from './gui-svg-display';
import { internal } from './gui-core';
import { GUI } from './gui-lib';
import { El } from './gui-el';

export function LayerRenderer(gui, container) {
  var el = El(container),
      ext = gui.map.getExtent(),
      mouse = gui.map.getMouse(),
      _mainCanv = new DisplayCanvas().appendTo(el),
      _overlayCanv = new DisplayCanvas().appendTo(el),
      _svg = new SvgDisplayLayer(gui, ext, mouse).appendTo(el),
      _furniture = new SvgDisplayLayer(gui, ext, null).appendTo(el),
      _ext = ext;

  // Fast-nav config: when the most recent render cycle exceeded SLOW_FRAME_MS,
  // subsequent 'nav' actions transform the previously rendered bitmap via CSS
  // instead of re-drawing vector content. This trades visible scaling/edge
  // artifacts for smoother panning and zooming on large datasets.
  //
  // Canvas 2D paint ops are normally rasterized asynchronously, so JS usually
  // returns long before the pixels are committed to the compositor. We force
  // a synchronous flush at the end of a full render (see flushCanvas) so that
  //   (a) the elapsed time reflects the *true* frame cost (JS + rasterization)
  //       rather than just the JS portion, and
  //   (b) subsequent fast-nav CSS transforms composite cleanly rather than on
  //       top of a still-committing bitmap.
  // We use only the most recent sample because previous renders may have
  // drawn a different scene (e.g. a simpler layer that is no longer active).
  var SLOW_FRAME_MS = 100;
  // Fallback delay before triggering a redraw if no explicit end-of-interaction
  // event arrives. The primary trigger is gui 'map_interaction_end' (mouse
  // release, wheel timeout, zoom tween done); this timer only fires if that
  // signal is somehow missed, so it's set generously.
  var FAST_SETTLE_FALLBACK_MS = 2000;
  var _lastFrameMs = 0; // duration of the most recent full render cycle
  var _snapshot = null; // {bounds, width, height, pixRatio}
  var _fastActive = false;
  var _settleTimer = null;
  var _redrawPending = false;
  var _settleRequested = false;

  // 'map_interaction_end' may arrive before the in-flight 'nav' draw runs,
  // because drawLayers() schedules its work via requestAnimationFrame.
  // We latch the intent so that whichever order things happen in, the
  // settle fires immediately rather than waiting on the fallback timer.
  gui.on('map_interaction_end', function() {
    if (_redrawPending) {
      settleNow();
    } else {
      _settleRequested = true;
    }
  });

  // don't let furniture container block events to symbol layers
  _furniture.css('pointer-events', 'none');

  this.drawMainLayers = function(layers, action) {
    if (skipMainLayerRedraw(action)) return;
    if (action == 'nav' && shouldUseFastNav()) {
      applyFastTransform();
      // SVG symbol reposition is already cheap; keep labels/symbols accurate
      // while the canvas is being transformed.
      layers.forEach(function(lyr) {
        if (internal.layerHasSvgSymbols(lyr) || internal.layerHasLabels(lyr)) {
          _svg.reposition(lyr, 'symbol');
        }
      });
      markRedrawPending();
      return;
    }
    var startTime = performance.now();
    var needSvgRedraw = action != 'nav' && action != 'hover';
    cancelSettle();
    _redrawPending = false;
    _settleRequested = false; // a full render satisfies any pending settle
    clearFastTransform();
    _mainCanv.prep(_ext);
    if (needSvgRedraw) {
      _svg.clear();
    }
    layers.forEach(function(lyr) {
      var isSvgLayer = internal.layerHasSvgSymbols(lyr) || internal.layerHasLabels(lyr);
      if (isSvgLayer && !needSvgRedraw) {
        _svg.reposition(lyr, 'symbol');
      } else if (isSvgLayer) {
        _svg.drawLayer(lyr, 'symbol');
      } else {
         drawCanvasLayer(lyr, _mainCanv);
      }
    });
    // Force synchronous rasterization so performance.now() reflects the true
    // frame cost (including GPU paint-op commit), and so subsequent fast-nav
    // CSS transforms don't composite over a still-pending canvas commit.
    flushCanvas(_mainCanv);
    _lastFrameMs = performance.now() - startTime;
    captureSnapshot();
  };

  // Draw highlight effect for hover and selection
  // Highlights get drawn on the main canvas most of the time, because redrawing
  //   is noticeably slower during animations with multiple canvases.
  // Highlights are drawn on a separate canvas while hovering, because this
  //   is generally faster than redrawing all of the shapes.
  this.drawOverlayLayers = function(layers, action) {
    var canv;
    if (action == 'hover') {
      canv = _overlayCanv;
      _overlayCanv.prep(_ext);
    } else {
      canv = _mainCanv;
      _overlayCanv.hide();
    }
    layers.forEach(function(lyr) {
      drawCanvasLayer(lyr, canv);
    });
  };

  this.drawFurnitureLayers = function(layers, action) {
    // re-render if action == 'nav', because scalebars get resized
    var noRedraw = action == 'hover';
    if (!noRedraw) {
      _furniture.clear();
    }
    layers.forEach(function(lyr) {
      if (noRedraw) {
        _furniture.reposition(lyr, 'furniture');
      } else {
        _furniture.drawLayer(lyr, 'furniture');
      }
    });
  };

  // kludge: skip rendering base layers if hovering, except on first hover
  // (because highlight shapes may be rendered to the main canvas)
  function skipMainLayerRedraw(action) {
    return action == 'hover' && _overlayCanv.visible();
  }

  function drawCanvasLayer(lyr, canv) {
    if (!lyr) return;
    if (lyr.gui.style.type == 'outline') {
      drawOutlineLayerToCanvas(lyr, canv, ext);
    } else {
      drawStyledLayerToCanvas(lyr, canv, ext);
    }
  }

  // Reading back a single pixel forces Chrome/Firefox to synchronously complete
  // any queued paint operations before returning. This converts an unbounded
  // deferred "Commit" phase into in-line wall time we can measure, and ensures
  // the canvas pixels are actually on screen before the caller returns.
  function flushCanvas(canv) {
    try {
      canv.node().getContext('2d').getImageData(0, 0, 1, 1);
    } catch (e) {
      // e.g. cross-origin-tainted canvas (shouldn't happen here, but safe)
    }
  }

  function getSvgLayerType(layer) {
    var type = null;
    if (internal.layerHasSvgSymbols(layer)) {
      type = 'symbol'; // also label + symbol
    } else if (internal.layerHasLabels(layer)) {
      type = 'symbol';
    }
    return type;
  }

  function captureSnapshot() {
    _snapshot = {
      bounds: _ext.getBounds(),
      width: _ext.width(),
      height: _ext.height(),
      pixRatio: GUI.getPixelRatio()
    };
  }

  function shouldUseFastNav() {
    if (!_snapshot) return false;
    if (_lastFrameMs <= SLOW_FRAME_MS) return false;
    if (_snapshot.width != _ext.width() || _snapshot.height != _ext.height()) return false;
    if (_snapshot.pixRatio != GUI.getPixelRatio()) return false;
    return true;
  }

  // Apply a CSS transform to the main canvas so its previously rendered
  // contents line up with the current map extent. The canvas bitmap is not
  // redrawn.
  function applyFastTransform() {
    var t = _ext.getTransform();
    var b = _snapshot.bounds;
    var tl = t.transform(b.xmin, b.ymax);
    var br = t.transform(b.xmax, b.ymin);
    var sx = (br[0] - tl[0]) / _snapshot.width;
    var sy = (br[1] - tl[1]) / _snapshot.height;
    // On retina the canvas bitmap is already scaled down to CSS pixels via a
    // CSS transform from the .retina class; overriding `transform` here
    // replaces that rule so we must bake the pixRatio scale back in.
    var k = 1 / _snapshot.pixRatio;
    setFastTransform(_mainCanv.node(), tl[0], tl[1], sx * k, sy * k);
    _fastActive = true;
  }

  function clearFastTransform() {
    if (!_fastActive) return;
    var node = _mainCanv.node();
    node.style.transform = '';
    node.style.transformOrigin = '';
    _fastActive = false;
  }

  function setFastTransform(node, tx, ty, sx, sy) {
    node.style.transformOrigin = 'top left';
    node.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + sx + ',' + sy + ')';
  }

  // Record that a fast-nav frame is showing so that the next end-of-interaction
  // event (or the fallback timer) can trigger a real redraw. Each fast-nav
  // frame resets the fallback timer so it only fires after the user truly
  // stops interacting, as a backstop for any interaction path that doesn't
  // emit 'map_interaction_end'. If 'map_interaction_end' was already
  // received before this frame ran (e.g. the home button reset, which
  // dispatches synchronously while the nav draw is still queued in rAF),
  // settle right now instead of waiting.
  function markRedrawPending() {
    _redrawPending = true;
    cancelSettle();
    if (_settleRequested) {
      _settleRequested = false;
      settleNow();
    } else {
      _settleTimer = setTimeout(settleNow, FAST_SETTLE_FALLBACK_MS);
    }
  }

  function settleNow() {
    cancelSettle();
    if (!_redrawPending) return;
    _redrawPending = false;
    gui.dispatchEvent('map-needs-refresh');
  }

  function cancelSettle() {
    if (_settleTimer) {
      clearTimeout(_settleTimer);
      _settleTimer = null;
    }
  }
}
