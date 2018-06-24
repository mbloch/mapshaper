/* @requires mapshaper-svg-display, @mapshaper-canvas, mapshaper-map-style */

function LayerStack(container, ext, mouse) {
  var el = El(container),
      _activeCanv = new DisplayCanvas().appendTo(el),  // data layer shapes
      _overlayCanv = new DisplayCanvas().appendTo(el), // data layer shapes
      _overlay2Canv = new DisplayCanvas().appendTo(el),  // line intersection dots
      _svg = new SvgDisplayLayer(ext, mouse).appendTo(el), // labels, _ext;
      _ext = ext;

  this.drawOverlay2Layer = function(lyr) {
    drawSingleCanvasLayer(lyr, _overlay2Canv);
  };

  this.drawOverlayLayer = function(lyr) {
    drawSingleCanvasLayer(lyr, _overlayCanv);
  };

  this.drawLayers = function(layers, onlyNav) {
    _activeCanv.prep(_ext);
    if (!onlyNav) {
      _svg.clear();
    }
    layers.forEach(function(target) {
      if (target.canvas) {
        drawCanvasLayer(target, _activeCanv);
      }
      if (target.svg) {
        drawSvgLayer(target, onlyNav);
      }
    });
  };

  function drawCanvasLayer(target, canv) {
    if (target.style.type == 'outline') {
      drawOutlineLayerToCanvas(target, canv, ext);
    } else {
      drawStyledLayerToCanvas(target, canv, ext);
    }
  }

  function drawSvgLayer(target, onlyNav) {
    if (onlyNav) {
      _svg.reposition(target);
    } else {
      _svg.drawLayer(target);
    }
  }

  function drawSingleCanvasLayer(target, canv) {
    if (!target) {
      canv.hide();
    } else {
      canv.prep(_ext);
      drawCanvasLayer(target, canv);
    }
  }
}
