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

  if (internal.layerHasFurniture(layer)) {
    obj.furniture = true;
    obj.furniture_type = internal.getFurnitureLayerType(layer);
    obj.layer = layer;
    // treating furniture layers (other than frame) as tabular for now,
    // so there is something to show if they are selected
    obj.tabular = obj.furniture_type != 'frame';
  } else if (obj.empty) {
    obj.layer = {shapes: []}; // ideally we should avoid empty layers
  } else if (!layer.geometry_type) {
    obj.tabular = true;
  } else {
    obj.geographic = true;
    obj.layer = layer;
    obj.arcs = dataset.arcs; // replaced by filtered arcs during render sequence
  }

  if (obj.tabular) {
    utils.extend(obj, getDisplayLayerForTable(layer.data));
  }

  obj.bounds = getDisplayBounds(obj.layer, obj.arcs, obj.tabular);
  return obj;
}

function getDisplayBounds(lyr, arcs, isTable) {
  var arcBounds = arcs ? arcs.getBounds() : new Bounds(),
      marginPct = isTable ? getVariableMargin(lyr) : 0.025,
      bounds = arcBounds, // default display extent: all arcs in the dataset
      pad = 1e-4,
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

  if (!bounds || !bounds.hasBounds()) { // empty layer
    return new Bounds(); // may cause errors downstream
  }

  // Inflate display bounding box by a tiny amount (gives extent to single-point layers and collapsed shapes)
  // TODO: move this out of layer code -- now that display extent can include several layers
  bounds.padBounds(pad,pad,pad,pad);

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
