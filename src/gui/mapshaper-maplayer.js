/* @requires elements, mapshaper-canvas */


// Layer group contains a 
//
function ArcLayerGroup(src) {
  var _self = this;
  var _surface = new CanvasLayer();

  var _arcLyr = new ShapeLayer(src.getArcs(), _surface),
      _layers = [_arcLyr],
      _map;

  var _visible = true;
  this.visible = function(b) {
    return arguments.length == 0 ? _visible : _visible = !b, this;
  };

  // add arc layer
  //
  this.refresh = function() {
    if (_map && _map.isReady()) {
      drawLayers();  
    }
  };

  this.setMap = function(map) {
    _map = map;
    _surface.getElement().appendTo(map.getElement());
    map.on('display', drawLayers, this);
    map.getExtent().on('change', drawLayers, this);
  };

  function drawLayers() {
    if (!_self.visible()) return;
    var ext = _map.getExtent();
    // trace("draw; w, h:", ext.width(), ext.height());
    _surface.prepare(ext.width(), ext.height());
    //T.start();
    Utils.forEach(_layers, function(lyr) {
      lyr.draw(ext); // visibility handled by layer
    });
    //T.stop("draw");
  }
}


function ShapeLayer(src, surface) {
  var renderer = new ShapeRenderer();
  var _visible = true;
  var style = {
    strokeWidth: 1,
    strokeColor: "#0000CC",
    strokeAlpha: 1
  };

  this.visible = function(b) {
    return arguments.length == 0 ? _visible : _visible = !b, this;
  };

  this.draw = function(ext) {
    if (!this.visible()) return;

    // option: get array of shapes to render
    // option: get array of ids of shapes
    //
    // get visible shapes (in bounds if any)
    var shapes = src.getShapesInBounds(ext.getBounds());
    var tr = ext.getTransform();
    //trace("[ArcLayer#draw()] transform:", tr, "# in bounds:", shapes.length);

    // pass to renderer
    //
    // renderer.drawShapes().
    renderer.drawShapes(shapes, style, ext.getTransform(), surface.getContext());
  }
}

Opts.inherit(ShapeLayer, Waiter);

