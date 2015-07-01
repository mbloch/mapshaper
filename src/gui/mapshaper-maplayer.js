/* @requires mapshaper-canvas, mapshaper-gui-shapes */

// Interface for displaying the points and paths in a dataset
//
function LayerGroup(dataset) {
  var _surface = new CanvasLayer(),
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
    return _surface.getElement();
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

  this.hide = function() {
    _surface.clear();
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
      _surface.prepare(ext.width(), ext.height());
      _shapes.setMapExtent(ext);
      _draw(_shapes, style, _surface.getContext());
    }
  };

  this.remove = function() {
    if (_surface) {
      _surface.getElement().remove();
    }
  };

}
