/* @requires mapshaper-canvas, mapshaper-gui-shapes */

// Interface for displaying the points and paths in a dataset
//
function LayerGroup(dataset) {
  var _canvas = El('canvas').css('position:absolute;').node(),
      _bounds = MapShaper.getDatasetBounds(dataset),
      _lyr, _filteredArcs;

  initArcs();

  function initArcs() {
    _filteredArcs = dataset.arcs ? new FilteredArcCollection(dataset.arcs) : null;
  }

  this.showLayer = function(lyr) {
    _lyr = lyr; // TODO: make sure lyr is in dataset
  };

  this.getLayer = function() {
    return _lyr || dataset.layers[0];
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

  this.clear = function() {
    _canvas.getContext('2d').clearRect(0, 0, _canvas.width, _canvas.height);
  };

  // Update in response to an unknown change (e.g. as a result of editing)
  // TODO: find a less kludgy solution
  this.updated = function() {
    // if bounds have changed (e.g. after reprojection), update filtered arcs
    var bounds = MapShaper.getDatasetBounds(dataset);
    if (!bounds.equals(_bounds)) {
      initArcs();
      _bounds = bounds;
    }

    // update simplification level
    if (_filteredArcs) {
      _filteredArcs.setRetainedInterval(dataset.arcs.getRetainedInterval());
    }
  };

  this.setRetainedPct = function(pct) {
    _filteredArcs.setRetainedPct(pct);
    return this;
  };

  this.draw = function(style, ext) {
    var lyr = this.getLayer(),
        draw, shapes;
    if (_lyr.geometry_type == 'point') {
      shapes = new FilteredPointCollection(_lyr.shapes);
      draw = MapShaper.drawPoints;
    } else {
      shapes = _filteredArcs;
      draw = MapShaper.drawPaths;
    }
    this.clear();
    _canvas.width = ext.width();
    _canvas.height = ext.height();
    shapes.setMapExtent(ext);
    draw(shapes, style, _canvas);
  };

  this.remove = function() {
    this.getElement().remove();
  };

}
