import { enhanceArcCollectionForDisplay } from './gui-display-arcs';
import { getDisplayLayerForTable } from './gui-table';
import { needReprojectionForDisplay, projectArcsForDisplay, projectPointsForDisplay } from './gui-dynamic-crs';
import { filterLayerByIds } from './gui-layer-utils';
import { internal, Bounds, utils } from './gui-core';
import { getDatasetCrsInfo } from './gui-display-utils';

// displayCRS: CRS to use for display, or null (which clears any current display CRS)
export function projectDisplayLayer(lyr, displayCRS) {
  var crsInfo = getDatasetCrsInfo(lyr.source.dataset);
  var sourceCRS = crsInfo.crs;
  var lyr2;
  //if (!lyr.geographic || !sourceCRS) {
  // let getDisplayLayer() handle case of unprojectable source
  if (!lyr.geographic) {
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

  var displayCRS = opts.crs || null;
  // display arcs may have been generated when another layer in the dataset was converted for display... re-use if available
  var displayArcs = dataset.displayArcs || null;
  var sourceCRS;
  var emptyArcs;

  if (displayCRS && layer.geometry_type) {
    var crsInfo = getDatasetCrsInfo(dataset);
    if (crsInfo.error) {
      // unprojectable dataset -- return empty layer
      obj.empty = true;
      obj.geographic = true;
    } else {
      sourceCRS = crsInfo.crs;
    }
  }

  // Assume that dataset.displayArcs is in the display CRS
  // (it must be deleted upstream if reprojection is needed)
  if (!obj.empty && dataset.arcs && !displayArcs) {
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
  var bounds = internal.getLayerBounds(lyr, arcs) || new Bounds();
  if (lyr.geometry_type == 'point' && arcs && bounds.hasBounds() && bounds.area() > 0 === false) {
    // if a point layer has no extent (e.g. contains only a single point),
    // then merge with arc bounds, to place the point in context.
    bounds = bounds.mergeBounds(arcs.getBounds());
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
