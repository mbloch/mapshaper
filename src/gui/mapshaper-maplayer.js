/* @requires mapshaper-canvas, mapshaper-gui-shapes, mapshaper-gui-table */

function DisplayLayer(lyr, dataset) {
  var _displayBounds;

  init();

  this.setStyle = function(o) {
    lyr.display.style = o;
  };

  this.getBounds = function() {
    return _displayBounds;
  };

  this.setRetainedPct = function(pct) {
    if (dataset.arcs) {
      dataset.arcs.setRetainedPct(pct);
    }
  };

  this.updateStyle = function(style) {
    var o = this.getDisplayLayer();
    // dot style
    style.dotSize = calcDotSize(MapShaper.countPointsInLayer(o.layer));
    // arc style
    if (o.dataset.arcs) {
      lyr.display.arcFlags = new Uint8Array(o.dataset.arcs.size());
      if (MapShaper.layerHasPaths(o.layer)) {
        initArcFlags(o.layer.shapes, lyr.display.arcFlags);
      }
    }
  };

  // @ext (optional) map extent
  // @ids (optional) ids of selected shapes
  this.getDisplayLayer = function(ext, ids) {
    var arcs = lyr.display.arcs,
        layer = lyr.display.layer || lyr;
    if (!arcs) {
      // use filtered arcs if available & map extent is known
      arcs = ext && dataset.filteredArcs ?
        dataset.filteredArcs.getArcCollection(ext) : dataset.arcs;
    }
    return {
      layer: layer,
      dataset: {arcs: arcs},
      geographic: layer == lyr // (kludge) false if using table-only shapes
    };
  };

  this.draw = function(canv, style, ext) {
    style = style || lyr.display.style;
    if (style.type == 'outline') {
      this.drawStructure(canv, style, ext);
    } else {
      this.drawShapes(canv, style, ext);
    }
  };

  this.drawStructure = function(canv, style, ext) {
    var obj = this.getDisplayLayer(ext);
    var arcs = obj.dataset.arcs;
    if (arcs && lyr.display.arcFlags) {
      canv.drawArcs(arcs, lyr.display.arcFlags, style);
    }
    if (obj.layer.geometry_type == 'point') {
      canv.drawSquareDots(obj.layer.shapes, style);
    }
  };

  this.drawShapes = function(canv, style, ext) {
    var obj = this.getDisplayLayer(ext);
    var lyr = style.ids ? filterLayer(obj.layer, style.ids) : obj.layer;
    if (lyr.geometry_type == 'point') {
      canv.drawPoints(lyr.shapes, style);
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

  function initArcFlags(shapes, arr) {
    // Arcs belonging to at least one path are flagged 1, others 0
    MapShaper.countArcsInShapes(shapes, arr);
    for (var i=0, n=arr.length; i<n; i++) {
      arr[i] = arr[i] === 0 ? 0 : 1;
    }
  }

  function calcDotSize(n) {
    return n < 20 && 5 || n < 500 && 4 || n < 50000 && 3 || 2;
  }

  function init() {
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
  }
}

function getDisplayBounds(lyr, arcs) {
  var arcBounds = arcs ? arcs.getBounds() : new Bounds(),
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
