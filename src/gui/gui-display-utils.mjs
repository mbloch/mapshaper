import { internal, Bounds, utils } from './gui-core';
import { setLoggingForGUI } from './gui-proxy';

export function getDatasetCrsInfo(dataset) {
  var revertLogging = internal.getLoggingSetter();
  var crs, err;
  // prevent GUI message popup on error
  internal.setLoggingForCLI();
  try {
    crs = internal.getDatasetCRS(dataset);
  } catch(e) {
    err = e.message;
  }
  revertLogging();
  return {
    crs: crs,
    error: err
  };
}

// Convert a point from display CRS coordinates to data coordinates.
// These are only different when using dynamic reprojection (basemap view).
export function translateDisplayPoint(lyr, p) {
  return isProjectedLayer(lyr) ? lyr.invertPoint(p[0], p[1]) : p;
}

// bbox: display coords
// intended to work with rectangular projections like Mercator
export function getBBoxCoords(lyr, bbox) {
  if (!isProjectedLayer(lyr)) return bbox.concat();
  var a = translateDisplayPoint(lyr, [bbox[0], bbox[1]]);
  var b = translateDisplayPoint(lyr, [bbox[2], bbox[3]]);
  var bounds = new internal.Bounds();
  bounds.mergePoint(a[0], a[1]);
  bounds.mergePoint(b[0], b[1]);
  return bounds.toArray();
}

export function isProjectedLayer(lyr) {
  // TODO: could do some validation on the layer's contents
  return !!(lyr.source && lyr.invertPoint);
}
