/* @requires mapshaper-canvas, mapshaper-gui-shapes */

// Group of one ore more layers sharing the same set of arcs
// @arcData an ArcDataset
//
function ArcLayerGroup(arcData) {
  var _self = this;
  var _surface = new CanvasLayer();
  var arcs = new FilteredPathCollection(arcData.getArcs(), arcData.getBounds());

  var _arcLyr = new ShapeLayer(arcs, _surface),
      _layers = [_arcLyr],
      _map;

  var _visible = true;
  this.visible = function(b) {
    return arguments.length === 0 ? _visible : _visible = !b, this;
  };

  this.refresh = function() {
    if (_map) drawLayers();
  };

  this.setMap = function(map) {
    _map = map;
    _surface.getElement().appendTo(map.getElement());
    map.on('refresh', drawLayers, this);
    map.getExtent().on('change', drawLayers, this);
  };

  function drawLayers() {
    if (!_self.visible()) return;
    var ext = _map.getExtent();
    _surface.prepare(ext.width(), ext.height());

    Utils.forEach(_layers, function(lyr) {
      lyr.draw(ext); // visibility handled by layer
    });
  }
}


function ShapeLayer(shapes, surface) {
  var renderer = new ShapeRenderer();
  var _visible = true;
  var style = {
    strokeWidth: 1,
    strokeColor: "#335",
    strokeAlpha: 1
  };

  this.visible = function(b) {
    return arguments.length === 0 ? _visible : _visible = !b, this;
  };

  this.draw = function(ext) {
    if (!this.visible()) return;
    //T.start();
    shapes.reset().filterPaths(ext.getBounds()).transform(ext.getTransform());
    var info = renderer.drawShapes(shapes, style, surface.getContext());
    // TODO: find a way to enable circles at an appropriate zoom
    // if (ext.scale() > 0) renderer.drawPoints(src.shapes().filterPoints(ext.getBounds()).transform(ext.getTransform()), surface.getContext());
    // T.stop("- paths: " + info.paths + " segs: " + info.segments);
  };
}

Opts.inherit(ShapeLayer, Waiter);

