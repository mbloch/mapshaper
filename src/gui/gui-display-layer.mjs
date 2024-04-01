import { enhanceArcCollectionForDisplay } from './gui-display-arcs';
import { getDisplayLayerForTable } from './gui-table';
import { needReprojectionForDisplay, projectArcsForDisplay, projectPointsForDisplay } from './gui-dynamic-crs';
import { filterLayerByIds } from './gui-layer-utils';
import { internal, Bounds, utils } from './gui-core';
import { getDatasetCrsInfo } from './gui-display-utils';

// lyr: a map layer with gui property
// displayCRS: CRS to use for display, or null (which clears any current display CRS)
export function projectLayerForDisplay(lyr, displayCRS) {
  var crsInfo = getDatasetCrsInfo(lyr.gui.source.dataset);
  var sourceCRS = crsInfo.crs || null; // let enhanceLayerForDisplay() handle null case
  if (!lyr.gui.geographic) {
    return;
  }
  if (lyr.gui.dynamic_crs && internal.crsAreEqual(sourceCRS, lyr.gui.dynamic_crs)) {
    return;
  }
  var gui = lyr.gui;
  enhanceLayerForDisplay(lyr, lyr.gui.source.dataset, {crs: displayCRS});
  utils.defaults(lyr.gui, gui); // re-apply any properties that were lost (e.g. svg_id)
  if (lyr.gui.style?.ids) {
    // re-apply layer filter
    lyr.gui.displayLayer = filterLayerByIds(lyr.gui.displayLayer, lyr.gui.style.ids);
  }
}


// Supplement a layer with information needed for rendering
export function enhanceLayerForDisplay(layer, dataset, opts) {
  var gui = {
    empty: internal.getFeatureCount(layer) === 0,
    geographic: false,
    displayArcs: null,
    displayLayer: null,
    source: {dataset},
    bounds: null,
    style: null,
    dynamic_crs: null,
    invertPoint: null,
    projectPoint: null
  };

  var displayCRS = opts.crs || null;
  // display arcs may have been generated when another layer in the dataset
  // was converted for display... re-use if available
  var displayArcs = dataset.gui?.displayArcs;
  var unprojectable = false;
  var sourceCRS;
  var emptyArcs;

  if (displayCRS && layer.geometry_type) {
    var crsInfo = getDatasetCrsInfo(dataset);
    if (crsInfo.error) {
      // unprojectable dataset -- return empty layer
      gui.unprojectable = true;
    } else {
      sourceCRS = crsInfo.crs;
    }
  }

  // make sure that every path layer has an associated arc collection
  // (if the layer is empty, its dataset may not have an arc collection).
  // this enables adding shapes using the drawing tools.
  if (!dataset.arcs && (layer.geometry_type == 'polygon' || layer.geometry_type == 'polyline')) {
    dataset.arcs = new internal.ArcCollection();
  }

  // Assume that dataset.displayArcs is in the display CRS
  // (it must be deleted upstream if reprojection is needed)
  // if (!obj.empty && dataset.arcs && !displayArcs) {
  if (dataset.arcs && !displayArcs && !gui.unprojectable) {
    // project arcs, if needed
    if (needReprojectionForDisplay(sourceCRS, displayCRS)) {
      displayArcs = projectArcsForDisplay(dataset.arcs, sourceCRS, displayCRS);
    } else {
      // Use original arcs for display if there is no dynamic reprojection
      displayArcs = dataset.arcs;
    }

    enhanceArcCollectionForDisplay(displayArcs);
    dataset.gui = {displayArcs}; // stash these in the dataset for other layers to use
  }

  if (internal.layerHasFurniture(layer)) {
    // TODO: consider how to render furniture in GUI
    // treating furniture layers (other than frame) as tabular for now,
    // so there is something to show if they are selected
  }

  if (gui.unprojectable) {
    gui.displayLayer = {shapes: []}; // TODO: improve
  } else if (layer.geometry_type) {
    gui.geographic = true;
    gui.displayLayer = layer;
    gui.displayArcs = displayArcs;
  } else {
    var table = getDisplayLayerForTable(layer.data);
    gui.tabular = true;
    gui.displayLayer = table.layer;
    gui.displayArcs = table.arcs;
  }

  // dynamic reprojection (arcs were already reprojected above)
  if (gui.geographic && needReprojectionForDisplay(sourceCRS, displayCRS)) {
    gui.dynamic_crs = displayCRS;
    gui.invertPoint = internal.getProjTransform2(displayCRS, sourceCRS);
    gui.projectPoint = internal.getProjTransform2(sourceCRS, displayCRS);
    if (internal.layerHasPoints(layer)) {
      gui.displayLayer = projectPointsForDisplay(layer, sourceCRS, displayCRS);
    } else if (internal.layerHasPaths(layer)) {
      emptyArcs = findEmptyArcs(displayArcs);
      if (emptyArcs.length > 0) {
        // Don't try to draw paths containing coordinates that failed to project
        gui.displayLayer = internal.filterPathLayerByArcIds(gui.displayLayer, emptyArcs);
      }
    }
  }

  gui.bounds = getDisplayBounds(gui.displayLayer, gui.displayArcs);
  layer.gui = gui;
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
