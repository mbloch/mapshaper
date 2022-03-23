import { enhanceArcCollectionForDisplay } from './gui-shapes';
import { getDisplayLayerForTable } from './gui-table';
import { needReprojectionForDisplay, projectArcsForDisplay, projectPointsForDisplay } from './gui-dynamic-crs';
import { filterLayerByIds } from './gui-layer-utils';
import { internal, Bounds, utils } from './gui-core';

export function insertVertex(lyr, id, dataPoint) {
  internal.insertVertex(lyr.source.dataset.arcs, id, dataPoint);
  if (isProjectedLayer(lyr)) {
    internal.insertVertex(lyr.arcs, id, lyr.projectPoint(dataPoint[0], dataPoint[1]));
  }
}

export function deleteVertex(lyr, id) {
  internal.deleteVertex(lyr.arcs, id);
  if (isProjectedLayer(lyr)) {
    internal.deleteVertex(lyr.source.dataset.arcs, id);
  }
}

export function translateDisplayPoint(lyr, p) {
  return isProjectedLayer(lyr) ? lyr.invertPoint(p[0], p[1]) : p;
}

export function getVertexCoords(lyr, id) {
  return lyr.source.dataset.arcs.getVertex2(id);
}

export function setVertexCoords(lyr, ids, dataPoint) {
  internal.snapVerticesToPoint(ids, dataPoint, lyr.source.dataset.arcs, true);
  if (isProjectedLayer(lyr)) {
    var p = lyr.projectPoint(dataPoint[0], dataPoint[1]);
    internal.snapVerticesToPoint(ids, p, lyr.arcs, true);
  }
}

export function updateVertexCoords(lyr, ids) {
  if (!isProjectedLayer(lyr)) return;
  var p = lyr.arcs.getVertex2(ids[0]);
  internal.snapVerticesToPoint(ids, lyr.invertPoint(p[0], p[1]), lyr.source.dataset.arcs, true);
}

export function makePointSetter(lyr, fid) {
  var dataShp = internal.cloneShape(lyr.source.layer.shapes[fid]);
  var displayShp = isProjectedLayer(lyr) ? internal.cloneShape(lyr.layer.shapes[fid]) : null;

  return function() {
    lyr.source.layer.shapes[fid] = dataShp;
    if (isProjectedLayer(lyr)) {
      if (displayShp) {
        // case: layer is projected and we have saved projected coordinates
        //       (assumes projection has not changed)
        lyr.layer.shapes[fid] = displayShp;
      } else {
        // case: layer was projected after this setter was created --
        //       need to project the original data coords
        lyr.layer.shapes[fid] = projectPointShape(dataShp, lyr.projectPoint);
      }
    }
  };
}

function isProjectedLayer(lyr) {
  // TODO: could do some validation on the layer's contents
  return !!(lyr.source && lyr.invertPoint);
}

// Update data coordinates by projecting display coordinates
export function updatePointCoords(lyr, fid) {
  if (!isProjectedLayer(lyr)) return;
  var displayShp = lyr.layer.shapes[fid];
  lyr.source.layer.shapes[fid] = projectPointShape(displayShp, lyr.invertPoint);
}

function projectPointShape(src, proj) {
  var dest = [], p;
  for (var i=0; i<src.length; i++) {
    p = proj(src[i][0], src[i][1]);
    if (p) dest.push(p);
  }
  return dest.length ? dest : null;
}

// displayCRS: CRS to use for display, or null (which clears any current display CRS)
export function projectDisplayLayer(lyr, displayCRS) {
  var sourceCRS = internal.getDatasetCRS(lyr.source.dataset);
  var lyr2;
  if (!lyr.geographic || !sourceCRS) {
    return lyr;
  }
  if (lyr.dynamic_crs && internal.crsAreEqual(sourceCRS, lyr.dynamic_crs)) {
    return lyr;
  }
  lyr2 = getDisplayLayer(lyr.source.layer, lyr.source.dataset, {crs: displayCRS});
  // kludge: copy projection-related properties to original layer
  lyr.dynamic_crs = lyr2.dynamic_crs;
  lyr.layer = lyr2.layer;
  if (lyr.style && lyr.style.ids) {
    // re-apply layer filter
    lyr.layer = filterLayerByIds(lyr.layer, lyr.style.ids);
  }
  lyr.invertPoint = lyr2.invertPoint;
  lyr.projectPoint = lyr2.projectPoint;
  lyr.bounds = lyr2.bounds;
  lyr.arcs = lyr2.arcs;
}


// Wrap a layer in an object along with information needed for rendering
export function getDisplayLayer(layer, dataset, opts) {
  var obj = {
    layer: null,
    arcs: null,
    // display_arcs: null,
    style: null,
    invertPoint: null,
    projectPoint: null,
    source: {
      layer: layer,
      dataset: dataset
    },
    empty: internal.getFeatureCount(layer) === 0
  };

  var sourceCRS = opts.crs && internal.getDatasetCRS(dataset); // get src iff display CRS is given
  var displayCRS = opts.crs || null;
  // display arcs may have been generated when another layer in the dataset was converted for display... re-use if available
  var displayArcs = dataset.displayArcs || null;
  var emptyArcs;

  // Assume that dataset.displayArcs is in the display CRS
  // (it must be deleted upstream if reprojection is needed)
  if (dataset.arcs && !displayArcs) {
    // project arcs, if needed
    if (needReprojectionForDisplay(sourceCRS, displayCRS)) {
      displayArcs = projectArcsForDisplay(dataset.arcs, sourceCRS, displayCRS);
    } else {
      // Use original arcs for display if there is no dynamic reprojection
      displayArcs = dataset.arcs;
    }

    enhanceArcCollectionForDisplay(displayArcs);
    dataset.displayArcs = displayArcs; // stash these in the dataset for other layers to use
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
    obj.arcs = displayArcs;
  }

  if (obj.tabular) {
    utils.extend(obj, getDisplayLayerForTable(layer.data));
  }

  // dynamic reprojection (arcs were already reprojected above)
  if (obj.geographic && needReprojectionForDisplay(sourceCRS, displayCRS)) {
    obj.dynamic_crs = displayCRS;
    obj.invertPoint = internal.getProjTransform2(displayCRS, sourceCRS);
    obj.projectPoint = internal.getProjTransform2(sourceCRS, displayCRS);
    if (internal.layerHasPoints(layer)) {
      obj.layer = projectPointsForDisplay(layer, sourceCRS, displayCRS);
    } else if (internal.layerHasPaths(layer)) {
      emptyArcs = findEmptyArcs(displayArcs);
      if (emptyArcs.length > 0) {
        // Don't try to draw paths containing coordinates that failed to project
        obj.layer = internal.filterPathLayerByArcIds(obj.layer, emptyArcs);
      }
    }
  }

  obj.bounds = getDisplayBounds(obj.layer, obj.arcs);
  return obj;
}


function getDisplayBounds(lyr, arcs) {
  var arcBounds = arcs ? arcs.getBounds() : new Bounds(),
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

  if (!bounds || !bounds.hasBounds()) { // empty layer
    bounds = new Bounds();
  }
  return bounds;
}

// Returns an array of ids of empty arcs (arcs can be set to empty if errors occur while projecting them)
function findEmptyArcs(arcs) {
  var nn = arcs.getVertexData().nn;
  var ids = [];
  for (var i=0, n=nn.length; i<n; i++) {
    if (nn[i] === 0) {
      ids.push(i);
    }
  }
  return ids;
}
