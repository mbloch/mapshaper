/* @requires mapshaper-canvas, mapshaper-gui-shapes, mapshaper-gui-table */

// Wrapper class for a data layer. Has methods for mediating between the GUI interface
// (layer display and interactive simplification) and the underlying data.
// Provides reduced-detail versions of arcs for rendering zoomed-out views of
// large data layers.
//
function DisplayLayer(lyr, dataset, ext) {
  var _displayBounds;
  var _arcCounts;

  this.getLayer = function() {return lyr;};

  this.getBounds = function() {
    return _displayBounds;
  };

  this.setRetainedPct = function(pct) {
    var arcs = dataset.filteredArcs || dataset.arcs;
    if (arcs) {
      arcs.setRetainedPct(pct);
    }
  };

  // @ext map extent
  this.getDisplayLayer = function() {
    var arcs = lyr.display.arcs,
        layer = lyr.display.layer || lyr;
    if (!arcs) {
      // use filtered arcs if available & map extent is known
      arcs = dataset.filteredArcs ?
        dataset.filteredArcs.getArcCollection(ext) : dataset.arcs;
    }
    return {
      layer: layer,
      dataset: {arcs: arcs},
      geographic: layer == lyr // false if using table-only shapes
    };
  };

  this.draw = function(canv, style) {
    if (style.type == 'outline') {
      this.drawStructure(canv, style);
    } else {
      this.drawShapes(canv, style);
    }
  };

  this.drawStructure = function(canv, style) {
    var obj = this.getDisplayLayer(ext);
    var arcs = obj.dataset.arcs;
    var darkStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[1]},
        lightStyle = {strokeWidth: style.strokeWidth, strokeColor: style.strokeColors[0]};
    var filter;
    if (arcs && _arcCounts) {
      if (lightStyle.strokeColor) {
        filter = getArcFilter(arcs, ext, false, _arcCounts);
        canv.drawArcs(arcs, lightStyle, filter);
      }
      if (darkStyle.strokeColor && obj.layer.geometry_type != 'point') {
        filter = getArcFilter(arcs, ext, true, _arcCounts);
        canv.drawArcs(arcs, darkStyle, filter);
      }
    }
    if (obj.layer.geometry_type == 'point') {
      canv.drawSquareDots(obj.layer.shapes, style);
    }
  };

  this.drawShapes = function(canv, style) {
    // TODO: add filter for out-of-view shapes
    var obj = this.getDisplayLayer(ext);
    var lyr = style.ids ? filterLayer(obj.layer, style.ids) : obj.layer;
    if (lyr.geometry_type == 'point') {
      if (style.type == 'styled') {
        canv.drawPoints(lyr.shapes, style);
      } else {
        canv.drawSquareDots(lyr.shapes, style);
      }
    } else {
      canv.drawPathShapes(lyr.shapes, obj.dataset.arcs, style);
    }
  };

  // Return a function for testing if an arc should be drawn at the current
  //   map view.
  function getArcFilter(arcs, ext, usedFlag, arcCounts) {
    var minPathLen = 0.5 * ext.getPixelSize(),
        geoBounds = ext.getBounds(),
        geoBBox = geoBounds.toArray(),
        allIn = geoBounds.contains(arcs.getBounds()),
        visible;
    // don't continue dropping paths if user zooms out farther than full extent
    if (ext.scale() < 1) minPathLen *= ext.scale();
    return function(i) {
      var visible = true;
      if (usedFlag != arcCounts[i] > 0) { // show either used or unused arcs
        visible = false;
      } else if (arcs.arcIsSmaller(i, minPathLen)) {
        visible = false;
      } else if (!allIn && !arcs.arcIntersectsBBox(i, geoBBox)) {
        visible = false;
      }
      return visible;
    };
  }

  function filterLayer(lyr, ids) {
    if (lyr.shapes) {
      shapes = ids.map(function(id) {
        return lyr.shapes[id];
      });
      return utils.defaults({shapes: shapes}, lyr);
    }
    return lyr;
  }

  function initArcCounts(self) {
    var o = self.getDisplayLayer();
    _arcCounts = o.dataset.arcs ? new Uint8Array(o.dataset.arcs.size()) : null;
    if (internal.layerHasPaths(o.layer)) {
      internal.countArcsInShapes(o.layer.shapes, _arcCounts);
    }
  }

  function init(self) {
    var display = lyr.display = lyr.display || {};
    var isTable = lyr.data && !lyr.geometry_type;

    // init filtered arcs, if needed
    if (internal.layerHasPaths(lyr) && !dataset.filteredArcs) {
      dataset.filteredArcs = new FilteredArcCollection(dataset.arcs);
    }

    // init table shapes, if needed
    if (isTable) {
      if (!display.layer || display.layer.shapes.length != lyr.data.size()) {
        utils.extend(display, gui.getDisplayLayerForTable(lyr.data));
      }
    } else if (display.layer) {
      delete display.layer;
      delete display.arcs;
    }

    _displayBounds = getDisplayBounds(display.layer || lyr, display.arcs || dataset.arcs, isTable);
    initArcCounts(self);
  }

  init(this);
}

function getDisplayBounds(lyr, arcs, isTable) {
  var arcBounds = arcs ? arcs.getBounds() : new Bounds(),
      marginPct = isTable ? getVariableMargin(lyr) : 0.025,
      bounds = arcBounds, // default display extent: all arcs in the dataset
      lyrBounds;

  if (lyr.geometry_type == 'point') {
    lyrBounds = internal.getLayerBounds(lyr);
    if (lyrBounds && lyrBounds.hasBounds()) {
      if (lyrBounds.area() > 0 || !arcBounds.hasBounds()) {
        bounds = lyrBounds;
      } else {
        // if a point layer has no extent (e.g. contains only a single point),
        // then merge with arc bounds, to place the point in context.
        bounds = arcBounds.mergeBounds(lyrBounds);
      }
    }
  }

  // If a layer has zero width or height (e.g. if it contains a single point),
  // inflate its display bounding box by a default amount
  if (bounds.width() === 0) {
    bounds.xmin = (bounds.centerX() || 0) - 1;
    bounds.xmax = bounds.xmin + 2;
  }
  if (bounds.height() === 0) {
    bounds.ymin = (bounds.centerY() || 0) - 1;
    bounds.ymax = bounds.ymin + 2;
  }
  bounds.scale(1 + marginPct * 2);
  return bounds;
}

// Calculate margin when displaying content at full zoom, as pct of screen size
function getVariableMargin(lyr) {
  var n = internal.getFeatureCount(lyr);
  var pct = 0.04;
  if (n < 5) {
    pct = 0.2;
  } else if (n < 100) {
    pct = 0.1;
  }
  return pct;
}
