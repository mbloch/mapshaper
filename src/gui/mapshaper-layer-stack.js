/* @requires mapshaper-svg-display, @mapshaper-canvas, mapshaper-map-style */

function LayerStack() {
  var self = El('#map-layers');
  var _activeCanv, _overlayCanv, _overlay2Canv,
      _svg, _ext;

  self.init = function(ext, mouse) {
    _ext = ext;
    _activeCanv = new DisplayCanvas().appendTo(self);      // data layer shapes
    _overlayCanv = new DisplayCanvas().appendTo(self);     // hover and selection shapes
    _overlay2Canv = new DisplayCanvas().appendTo(self);  // line intersection dots
    _svg = new SvgDisplayLayer(ext, mouse).appendTo(self); // labels
  };

  self.drawOverlay2Layer = function(lyr, style) {
    drawCanvasLayer(lyr, _overlay2Canv, style);
  };

  self.drawOverlayLayer = function(lyr, style) {
    drawCanvasLayer(lyr, _overlayCanv, style);
  };

  self.drawLayers = function(layers, onlyNav) {
    _activeCanv.prep(_ext);
    sortLayers(layers);
    layers.forEach(function(o) {
      drawLayer(o, onlyNav);
    });
  };

  function drawLayer(target, onlyNav) {
    var lyr = target.getLayer();
    target.draw(_activeCanv, lyr.display.style);
    // if (lyr.display.svg) {
    if (lyr.display.active) {
      _svg.drawLayer(lyr, onlyNav); // draw labels (if relevant)
    }
  }

  function drawCanvasLayer(lyr, canv, style) {
    if (style) {
      canv.prep(_ext);
      lyr.draw(canv, style);
    } else {
      canv.hide();
    }
  }

  // sort layers in their drawing order
  function sortLayers(arr) {
    arr.sort(function(a, b) {
      var za = getLayerStackOrder(a),
          zb = getLayerStackOrder(b);
      return za - zb;
    });
  }

  function getLayerStackOrder(o) {
    var lyr = o.getLayer();
    var type = lyr.geometry_type;
    var z = 0;
    if (type == 'point') z = 6;
    else if (type == 'polyline') z = 4;
    else if (type == 'polygon') z = 2;
    if (lyr.display.active) z += 1; // put active layer on top of same-type layers
    return z;
  }

  return self;
}
