/* @requires mapshaper-canvas, mapshaper-gui-shapes */

// Interface for displaying the points and paths in a dataset
//
function LayerGroup(dataset) {
  var _surface = new CanvasLayer(),
      _filteredArcs = dataset.arcs ? new FilteredArcCollection(dataset.arcs) : null,
      _shapes,
      _style,
      _map;

  this.showLayer = function(i) {
    var lyr = dataset.layers[i];
    if (lyr.geometry_type == 'point') {
      _shapes = new FilteredPointCollection(lyr.shapes);
    } else {
      error("TODO: draw non-point layers");
    }
    return this;
  };

  this.showArcs = function() {
    _shapes = _filteredArcs;
    return this;
  };

  this.setStyle = function(style) {
    _style = style;
    return this;
  };

  this.hide = function() {
    _surface.clear();
    _shapes = null;
  };

  this.setRetainedPct = function(pct) {
    _filteredArcs.setRetainedPct(pct);
    return this;
  };

  this.refresh = function() {
    if (_map && _shapes && _style) {
      var ext = _map.getExtent();
      _surface.prepare(ext.width(), ext.height());
      _shapes.setMapExtent(ext);
      MapShaper.drawShapes(_shapes, _style, _surface.getContext());
    }
  };

  this.setMap = function(map) {
    _map = map;
    _surface.getElement().appendTo(map.getElement());
    map.on('refresh', this.refresh, this);
    map.getExtent().on('change', this.refresh, this);
  };
}
