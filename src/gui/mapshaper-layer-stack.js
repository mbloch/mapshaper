/* @requires mapshaper-svg-display, @mapshaper-canvas */

function LayerStack() {
  var self = El('#map-layers');
  var _referenceCanv, _activeCanv, _overlayCanv, _annotationCanv,
      _svg, _ext;

  self.init = function(ext, mouse) {
    _ext = ext;
    _referenceCanv = new DisplayCanvas().appendTo(self); // comparison layer
    _activeCanv = new DisplayCanvas().appendTo(self);    // data layer shapes
    _overlayCanv = new DisplayCanvas().appendTo(self);   // hover and selection shapes
    _annotationCanv = new DisplayCanvas().appendTo(self); // line intersection dots
    _svg = new SvgDisplayLayer(ext, mouse).appendTo(self);  // labels
  };


  self.drawAnnotationLayer = function(lyr, style) {
    drawCanvasLayer(lyr, _annotationCanv, style);
  };

  self.drawReferenceLayer = function(lyr, style) {
    drawCanvasLayer(lyr, _referenceCanv, style);
  };

  self.drawOverlayLayer = function(lyr, style) {
    drawCanvasLayer(lyr, _overlayCanv, style);
  };

  self.drawActiveLayer = function(lyr, style, onlyNav) {
    drawCanvasLayer(lyr, _activeCanv, style);
    _svg.drawLayer(lyr.getLayer(), onlyNav); // draw labels (if relevant)
  };

  function drawCanvasLayer(lyr, canv, style) {
    if (style) {
      canv.prep(_ext);
      lyr.draw(canv, style);
    } else {
      canv.hide();
    }
  }

  return self;
}