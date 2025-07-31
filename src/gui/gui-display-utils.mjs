import { internal, Bounds, utils } from './gui-core';
import { setLoggingForGUI } from './gui-proxy';

export function getDatasetCrsInfo(dataset) {
  var revertLogging = internal.getLoggingSetter();
  var crs, err;
  // prevent GUI message popup on error
  internal.setLoggingForCLI();
  try {
    if (!dataset || internal.datasetIsEmpty(dataset) && !dataset.info?.crs) {
      crs = internal.parseCrsString('wgs84');
    } else {
      crs = internal.getDatasetCRS(dataset);
    }
  } catch(e) {
    err = e.message;
  }
  revertLogging();
  return {
    crs: crs,
    error: err
  };
}

// p1: [x, y] coords
// p2: [x, y] coords offset by 1x1 pixel
export function formatCoordsForDisplay(p1, p2) {
  var maxD = 13;
  var dx = Math.abs(p1[0] - p2[0]);
  var dy = Math.abs(p1[1] - p2[1]);
  var offs = (dx + dy) / 2;
  var decimals = 0;
  while (offs < 1 && decimals <= maxD) {
    offs *= 10;
    decimals++;
  }
  return [p1[0].toFixed(decimals), p1[1].toFixed(decimals)];
}

// Convert a point from display CRS coordinates to data coordinates.
// These are only different when using dynamic reprojection (basemap view).
export function translateDisplayPoint(lyr, p) {
  return isProjectedLayer(lyr) ? lyr.gui.invertPoint(p[0], p[1]) : p;
}

export function isProjectedLayer(lyr) {
  return !!lyr?.gui.invertPoint;
}
