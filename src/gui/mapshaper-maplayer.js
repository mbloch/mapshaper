/* @requires mapshaper-canvas, mapshaper-gui-shapes */

// Interface for displaying the points and paths in a dataset
//
function LayerGroup(dataset) {
  var _el = El('canvas'),
      _canvas = _el.node(),
      _ctx = _canvas.getContext('2d'),
      _lyr, _filteredArcs, _bounds;

  if (dataset) {
    _filteredArcs = dataset.arcs ? new FilteredArcCollection(dataset.arcs) : null;
    _bounds = MapShaper.getDatasetBounds(dataset);
  }

  this.hide = function() {
    _el.hide();
  };

  this.showLayer = function(lyr) {
    _lyr = lyr; // Layer may not be in dataset...
  };

  this.getLayer = function() {
    return _lyr;
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

  this.getArcs = function() {
    return _filteredArcs;
  };

  this.setArcs = function(arcs) {
    _filteredArcs = arcs;
  };

  // Rebuild filtered arcs and recalculate bounds
  this.updated = function() {
    if (dataset) {
      if (_filteredArcs) {
        _filteredArcs.update(dataset.arcs);
      }
      _bounds = MapShaper.getDatasetBounds(dataset);
    }
  };

  this.setRetainedPct = function(pct) {
    _filteredArcs.setRetainedPct(pct);
    return this;
  };

  this.drawStructure = function(lyr, style, ext) {
    updateCanvas(ext);
    _el.show();
    if (_filteredArcs) {
      drawArcs(style, ext);
    }
    if (lyr.geometry_type == 'point') {
      drawPoints(lyr.shapes, style, ext);
    }
  };

  this.drawShapes = function(lyr, style, ext) {
    var type = lyr.geometry_type;
        updateCanvas(ext);
    _el.show();
    if (type == 'point') {
      drawPoints(lyr.shapes, style, ext);
    } else {
      drawPathShapes(lyr.shapes, style, ext);
    }
  };

  this.remove = function() {
    this.getElement().remove();
  };

  function drawPathShapes(shapes, style, ext) {
    var arcs = _filteredArcs.getArcCollection(ext),
        start = getPathStart(style),
        draw = getShapePencil(arcs, ext),
        end = getPathEnd(style);
    for (var i=0, n=shapes.length; i<n; i++) {
      start(i, _ctx);
      draw(shapes[i], _ctx);
      end(_ctx);
    }
  }

  function drawArcs(style, ext) {
    var arcs = _filteredArcs.getArcCollection(ext),
        minPathLen = 0.5 * ext.getPixelSize(),
        geoBounds = ext.getBounds(),
        geoBBox = geoBounds.toArray(),
        allIn = geoBounds.contains(arcs.getBounds()),
        start = getPathStart(style),
        draw = getArcPencil(arcs, ext),
        end = getPathEnd(style);

    // don't drop more paths at less than full extent (i.e. zoomed far out)
    if (ext.scale() < 1) minPathLen *= ext.scale();

    for (var i=0, n=arcs.size(); i<n; i++) {
      if (arcs.arcIsSmaller(i, minPathLen)) continue;
      if (!allIn && !arcs.arcIntersectsBBox(i, geoBBox)) continue;
      start(i, _ctx);
      draw(i, _ctx);
      end(_ctx);
    }
  }

  function drawPoints(shapes, style, ext) {
    var t = getScaledTransform(ext),
        color = style.dotColor || "rgba(255, 50, 50, 0.5)",
        size = (style.dotSize || 3) * gui.getPixelRatio(),
        drawPoint = style.roundDot ? drawCircle : drawSquare,
        shp, p;
    // TODO: don't try to draw offscreen points
    for (var i=0, n=shapes.length; i<n; i++) {
      shp = shapes[i];
      for (var j=0; j<shp.length; j++) {
        p = shp[j];
        drawPoint(p[0] * t.mx + t.bx, p[1] * t.my + t.by, size, color, _ctx);
      }
    }
  }

  function clearCanvas() {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }

  function updateCanvas(ext) {
    var w = ext.width(),
        h = ext.height(),
        pixRatio = gui.getPixelRatio();
    clearCanvas();
    _canvas.width = w * pixRatio;
    _canvas.height = h * pixRatio;
    _el.classed('retina', pixRatio == 2);
  }
}
