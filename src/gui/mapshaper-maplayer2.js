/* @requires mapshaper-canvas, mapshaper-gui-shapes, mapshaper-gui-table */

// Wrap a layer in an object along with information needed for rendering
function getMapLayer(layer, dataset) {
  var obj = {
    layer: null,
    arcs: null,
    style: null,
    source: {
      layer: layer,
      dataset: dataset
    },
    empty: internal.getFeatureCount(layer) === 0
  };

  // init filtered arcs, if needed
  if (internal.layerHasPaths(layer) && !dataset.filteredArcs) {
    dataset.filteredArcs = new FilteredArcCollection(dataset.arcs);
  }

  if (obj.empty) return obj;

  if (!layer.geometry_type) {
    utils.extend(obj, gui.getDisplayLayerForTable(layer.data));
    obj.tabular = true;
  } else {
    obj.geographic = true;
    obj.layer = layer;
    obj.arcs = dataset.arcs; // replaced by filtered arcs during render sequence
  }

  obj.bounds = getDisplayBounds(obj.layer, obj.arcs, obj.tabular);
  return obj;
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