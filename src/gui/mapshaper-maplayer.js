/* @requires mapshaper-canvas, mapshaper-gui-shapes */

// Interface for displaying the points and paths in a dataset
//
function LayerGroup(dataset) {
  var _el = El('canvas').css('position:absolute;'),
      _canvas = _el.node(),
      _lyr, _filteredArcs, _bounds;

  init();

  function init() {
    _bounds = MapShaper.getDatasetBounds(dataset);
    _filteredArcs = dataset.arcs ? new FilteredArcCollection(dataset.arcs) : null;
  }

  this.hide = function() {
    _el.hide();
  };

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

  // Rebuild filtered arcs and recalculate bounds
  this.updated = function() {
    init();
  };

  this.setRetainedPct = function(pct) {
    _filteredArcs.setRetainedPct(pct);
    return this;
  };

  this.draw = function(style, ext) {
    var dataset = dataset,
        lyr = this.getLayer(),
        points;
    this.clear();
    _canvas.width = ext.width();
    _canvas.height = ext.height();
    _el.show();
    if (_filteredArcs) {
      _filteredArcs.setMapExtent(ext);
      MapShaper.drawPaths(_filteredArcs, style, _canvas);
    }
    if (lyr.geometry_type == 'point') {
      points = new FilteredPointCollection(lyr.shapes);
      points.setMapExtent(ext);
      MapShaper.drawPoints(points, style, _canvas);
    }
  };

  this.remove = function() {
    this.getElement().remove();
  };
}
