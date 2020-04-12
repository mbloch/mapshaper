import { drawOutlineLayerToCanvas, drawStyledLayerToCanvas, DisplayCanvas } from './gui-canvas';
import { SvgDisplayLayer } from './gui-svg-display';
import { internal } from './gui-core';
import { El } from './gui-el';

export function LayerStack(gui, container, ext, mouse) {
  var el = El(container),
      _activeCanv = new DisplayCanvas().appendTo(el),  // data layer shapes
      _overlayCanv = new DisplayCanvas().appendTo(el), // data layer shapes
      _overlay2Canv = new DisplayCanvas().appendTo(el),  // line intersection dots
      _svg = new SvgDisplayLayer(gui, ext, mouse).appendTo(el), // labels, _ext;
      _furniture = new SvgDisplayLayer(gui, ext, null).appendTo(el),  // scalebar, etc
      _ext = ext;

  // don't let furniture container block events to symbol layers
  _furniture.css('pointer-events', 'none');

  this.drawOverlay2Layer = function(lyr) {
    drawSingleCanvasLayer(lyr, _overlay2Canv);
  };

  this.drawOverlayLayer = function(lyr) {
    drawSingleCanvasLayer(lyr, _overlayCanv);
  };

  this.drawContentLayers = function(layers, onlyNav) {
    _activeCanv.prep(_ext);
    if (!onlyNav) {
      _svg.clear();
    }
    layers.forEach(function(target) {
      if (layerUsesCanvas(target.layer)) {
        drawCanvasLayer(target, _activeCanv);
      }
      if (layerUsesSVG(target.layer)) {
        drawSvgLayer(target, onlyNav);
      }
    });
  };

  this.drawFurnitureLayers = function(layers, onlyNav) {
    if (!onlyNav) {
      _furniture.clear();
    }
    layers.forEach(function(target) {
      if (onlyNav) {
        _furniture.reposition(target, 'furniture');
      } else {
        _furniture.drawLayer(target, 'furniture');
      }
    });
  };

  function layerUsesCanvas(layer) {
    // TODO: return false if a label layer does not have dots
    return !internal.layerHasSvgSymbols(layer);
  }

  function layerUsesSVG(layer) {
    return internal.layerHasLabels(layer) || internal.layerHasSvgSymbols(layer);
  }

  function drawCanvasLayer(target, canv) {
    if (target.style.type == 'outline') {
      drawOutlineLayerToCanvas(target, canv, ext);
    } else {
      drawStyledLayerToCanvas(target, canv, ext);
    }
  }

  function drawSvgLayer(target, onlyNav) {
    var type;
    if (internal.layerHasLabels(target.layer)) {
      type = 'label';
    } else if (internal.layerHasSvgSymbols(target.layer)) {
      type = 'symbol';
    }
    if (onlyNav) {
      _svg.reposition(target, type);
    } else {
      _svg.drawLayer(target, type);
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
