/* @requires mapshaper-canvas, mapshaper-gui-shapes */

// Interface for displaying the points and paths in a dataset
//
function LayerGroup(dataset) {
  var _canvas = El('canvas').css('position:absolute;').node(),
      _ctx = _canvas.getContext('2d'),
      _filteredArcs = dataset.arcs ? new FilteredArcCollection(dataset.arcs) : null,
      _bounds = MapShaper.getDatasetBounds(dataset),
      _draw,
      _lyr,
      _shapes;

  this.showLayer = function(lyr) {
    // TODO: make sure lyr is in dataset
    if (lyr.geometry_type == 'point') {
      _shapes = new FilteredPointCollection(lyr.shapes);
      _draw = MapShaper.drawPoints;
    } else {
      // TODO: show shapes, not arcs
      _shapes = _filteredArcs;
      _draw = MapShaper.drawPaths;
    }
    _lyr = lyr;
    return this;
  };

  this.getElement = function() {
    return El(_canvas);
  };

  this.getBounds = function() {
    return _bounds;
  };

  this.getDataset = function() {
    return dataset;
  };

  this.getLayer = function() {
    return _lyr;
  };

  this.clear = function() {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  };

  this.hide = function() {
    this.clear();
    _shapes = null;
  };

  this.updated = function() {
    if (_filteredArcs) {
      _filteredArcs.setRetainedInterval(dataset.arcs.getRetainedInterval());
    }
  };

  this.setRetainedPct = function(pct) {
    _filteredArcs.setRetainedPct(pct);
    return this;
  };

  this.draw = function(style, ext) {
    if (_shapes) {
      this.clear();
      _canvas.width = ext.width();
      _canvas.height = ext.height();
      _shapes.setMapExtent(ext);
      _draw(_shapes, style, _canvas);
    }
  };

  this.remove = function() {
    this.getElement().remove();
  };

}
