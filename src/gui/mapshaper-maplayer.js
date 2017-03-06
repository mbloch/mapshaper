/* @requires mapshaper-canvas, mapshaper-gui-shapes, mapshaper-gui-table */

function DisplayLayer(lyr, dataset, ext) {
  var _displayBounds;
  var _arcFlags;

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
    if (arcs && _arcFlags) {
      canv.drawArcs(arcs, _arcFlags, style);
    }
    if (obj.layer.geometry_type == 'point') {
      canv.drawSquareDots(obj.layer.shapes, style);
    }
  };

  this.drawShapes = function(canv, style) {
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

  function filterLayer(lyr, ids) {
    if (lyr.shapes) {
      shapes = ids.map(function(id) {
        return lyr.shapes[id];
      });
      return utils.defaults({shapes: shapes}, lyr);
    }
    return lyr;
  }

  function initArcFlags(self) {
    var o = self.getDisplayLayer();
    if (o.dataset.arcs && MapShaper.layerHasPaths(o.layer)) {
      _arcFlags = new Uint8Array(o.dataset.arcs.size());
      // Arcs belonging to at least one path are flagged 1, others 0
      MapShaper.countArcsInShapes(o.layer.shapes, _arcFlags);
      for (var i=0, n=_arcFlags.length; i<n; i++) {
        _arcFlags[i] = _arcFlags[i] === 0 ? 0 : 1;
      }
    }
  }

  function init(self) {
    var display = lyr.display = lyr.display || {};

    // init filtered arcs, if needed
    if (MapShaper.layerHasPaths(lyr) && !dataset.filteredArcs) {
      dataset.filteredArcs = new FilteredArcCollection(dataset.arcs);
    }

    // init table shapes, if needed
    if (lyr.data && !lyr.geometry_type) {
      if (!display.layer || display.layer.shapes.length != lyr.data.size()) {
        utils.extend(display, gui.getDisplayLayerForTable(lyr.data));
      }
    } else if (display.layer) {
      delete display.layer;
      delete display.arcs;
    }

    _displayBounds = getDisplayBounds(display.layer || lyr, display.arcs || dataset.arcs);
    initArcFlags(self);
  }

  init(this);
}

function getDisplayBounds(lyr, arcs) {
  var arcBounds = arcs ? arcs.getBounds() : new Bounds(),
      bounds = arcBounds, // default display extent: all arcs in the dataset
      lyrBounds;

  if (lyr.geometry_type == 'point') {
    lyrBounds = MapShaper.getLayerBounds(lyr);
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
