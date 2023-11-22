import { drawOutlineLayerToCanvas, drawStyledLayerToCanvas, DisplayCanvas } from './gui-canvas';
import { SvgDisplayLayer } from './gui-svg-display';
import { internal } from './gui-core';
import { El } from './gui-el';

export function LayerStack(gui, container, ext, mouse) {
  var el = El(container),
      _mainCanv = new DisplayCanvas().appendTo(el),
      _overlayCanv = new DisplayCanvas().appendTo(el),
      _svg = new SvgDisplayLayer(gui, ext, mouse).appendTo(el),
      _furniture = new SvgDisplayLayer(gui, ext, null).appendTo(el),
      _ext = ext;

  // don't let furniture container block events to symbol layers
  _furniture.css('pointer-events', 'none');

  this.drawMainLayers = function(layers, action) {
    var needSvgRedraw = action != 'nav' && action != 'hover';
    if (skipMainLayerRedraw(action)) return;
    _mainCanv.prep(_ext);
    if (needSvgRedraw) {
      _svg.clear();
    }
    layers.forEach(function(lyr) {
      var isSvgLayer = internal.layerHasSvgSymbols(lyr.layer) || internal.layerHasLabels(lyr.layer);
      //if (!svgType || svgType == 'label') { // svg labels may have canvas dots
      if (!isSvgLayer) { // svg labels may have canvas dots
        drawCanvasLayer(lyr, _mainCanv);
      }
      if (isSvgLayer && !needSvgRedraw) {
        _svg.reposition(lyr, 'symbol');
      } else if (isSvgLayer) {
        _svg.drawLayer(lyr, 'symbol');
      }
    });
  };

  // Draw highlight effect for hover and selection
  // Highlights get drawn on the main canvas most of the time, because redrawing
  //   is noticeably slower during animations with multiple canvases.
  // Highlights are drawn on a separate canvas while hovering, because this
  //   is generally faster than redrawing all of the shapes.
  this.drawOverlayLayer = function(lyr, action) {
    if (action == 'hover' && lyr) {
      _overlayCanv.prep(_ext);
      drawCanvasLayer(lyr, _overlayCanv);
    } else {
      _overlayCanv.hide();
      drawCanvasLayer(lyr, _mainCanv);
    }
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
    if (lyr.style.type == 'outline') {
      drawOutlineLayerToCanvas(lyr, canv, ext);
    } else {
      drawStyledLayerToCanvas(lyr, canv, ext);
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
}
