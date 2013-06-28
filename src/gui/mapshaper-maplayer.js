/* @requires elements, mapshaper-canvas */

// Layer group...
//
function ArcLayerGroup(arcs) {
  var _self = this;
  var _surface = new CanvasLayer();

  var _arcLyr = new ShapeLayer(arcs, _surface),
      _layers = [_arcLyr],
      _map;

  var _visible = true;
  this.visible = function(b) {
    return arguments.length == 0 ? _visible : _visible = !b, this;
  };
  /*
  this.getExportList = function() {
    var polygons = {
      label: "polygons",
      shapes: null
    };
    return [polygons];
  };*/

  this.refresh = function() {
    _map && drawLayers();
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

function ShapeLayer(src, surface) {
  var renderer = new ShapeRenderer();
  var _visible = true;
  var style = {
    strokeWidth: 1,
    strokeColor: "#335",
    strokeAlpha: 1
  };

  this.visible = function(b) {
    return arguments.length == 0 ? _visible : _visible = !b, this;
  };

  this.draw = function(ext) {
    if (!this.visible()) return;
    T.start();

    var shapes = src.shapes().filterPaths(ext.getBounds()).transform(ext.getTransform());
    var info = renderer.drawShapes(shapes, style, surface.getContext());
    // TODO: find a way to enable circles at an appropriate zoom
    // if (ext.scale() > 0) renderer.drawPoints(src.shapes().filterPoints(ext.getBounds()).transform(ext.getTransform()), surface.getContext());
    T.stop("- paths: " + info.paths + " segs: " + info.segments);
  }
}

Opts.inherit(ShapeLayer, Waiter);

