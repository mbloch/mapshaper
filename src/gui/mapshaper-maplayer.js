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
  }

  this.hide = function() {
    _el.hide();
  };

  this.showLayer = function(lyr) {
    _lyr = lyr;
    _bounds = getDisplayBounds(lyr, dataset);
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

  // Rebuild filtered arcs
  this.updated = function() {
    if (dataset && _filteredArcs) {
      _filteredArcs.update(dataset.arcs);
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
      drawArcs(style, style.arcFlags, ext);
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

  function getDisplayBounds(lyr, dataset) {
    var arcBounds = dataset && dataset.arcs ? dataset.arcs.getBounds() : new Bounds(),
        bounds = arcBounds, // default display extent: all arcs in the dataset
        lyrBounds;

    if (lyr.geometry_type == 'point') {
      lyrBounds = MapShaper.getLayerBounds(lyr);
      if (lyrBounds && lyrBounds.hasBounds()) {
        if (lyrBounds.area() > 0 || arcBounds.area() === 0) {
          bounds = lyrBounds;
        }
        // if a point layer has no extent (e.g. contains only a single point),
        // then use arc bounds (if present), to match any path layers in the dataset.
      }
    }

    // If a layer has collapsed, inflate it by a default amount
    if (bounds.width() === 0) {
      bounds.xmin = (bounds.centerX() || 0) - 1;
      bounds.xmax = bounds.xmin + 2;
    }
    if (bounds.height() === 0) {
      bounds.ymin = (bounds.centerY() || 0) - 1;
      bounds.ymax = bounds.ymin + 2;
    }
    return bounds;
  }

  function drawPathShapes(shapes, style, ext) {
    var arcs = _filteredArcs.getArcCollection(ext),
        start = getPathStart(style),
        draw = getShapePencil(arcs, ext),
        end = getPathEnd(style);
    for (var i=0, n=shapes.length; i<n; i++) {
      start(_ctx);
      draw(shapes[i], _ctx);
      end(_ctx);
    }
  }

  function drawArcs(style, flags, ext) {
    var arcs = _filteredArcs.getArcCollection(ext),
        darkStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[1]},
        lightStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[0]};
    setArcVisibility(flags, arcs, ext);
    drawFlaggedArcs(2, flags, lightStyle, arcs, ext);
    drawFlaggedArcs(3, flags, darkStyle, arcs, ext);
  }

  function setArcVisibility(flags, arcs, ext) {
    var minPathLen = 0.5 * ext.getPixelSize(),
        geoBounds = ext.getBounds(),
        geoBBox = geoBounds.toArray(),
        allIn = geoBounds.contains(arcs.getBounds()),
        visible;
    // don't continue dropping paths if user zooms out farther than full extent
    if (ext.scale() < 1) minPathLen *= ext.scale();
    for (var i=0, n=arcs.size(); i<n; i++) {
      visible = !arcs.arcIsSmaller(i, minPathLen) && (allIn ||
          arcs.arcIntersectsBBox(i, geoBBox));
      // mark visible arcs by setting second flag bit to 1
      flags[i] = (flags[i] & 1) | (visible ? 2 : 0);
    }
  }

  function drawFlaggedArcs(flag, flags, style, arcs, ext) {
    var start = getPathStart(style),
        end = getPathEnd(style),
        t = getScaledTransform(ext),
        ctx = _ctx,
        n = 25, // render paths in batches of this size (an optimization)
        count = 0;
    start(ctx);
    for (i=0, n=arcs.size(); i<n; i++) {
      if (flags[i] != flag) continue;
      if (++count % n === 0) {
        end(ctx);
        start(ctx);
      }
      drawPath(arcs.getArcIter(i), t, ctx);
    }
    end(ctx);
  }

  function drawPoints(shapes, style, ext) {
    var t = getScaledTransform(ext),
        size = (style.dotSize || 3) * gui.getPixelRatio(),
        drawPoint = style.roundDot ? drawCircle : drawSquare,
        shp, p;

    // TODO: don't try to draw offscreen points
    _ctx.fillStyle = style.dotColor || "black";
    for (var i=0, n=shapes.length; i<n; i++) {
      shp = shapes[i];
      for (var j=0, m=shp ? shp.length : 0; j<m; j++) {
        p = shp[j];
        drawPoint(p[0] * t.mx + t.bx, p[1] * t.my + t.by, size, _ctx);
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
