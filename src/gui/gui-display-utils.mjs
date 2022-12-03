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

export function flattenArcs(lyr) {
  lyr.source.dataset.arcs.flatten();
  if (isProjectedLayer(lyr)) {
    lyr.arcs.flatten();
  }
}

export function setZ(lyr, z) {
  lyr.source.dataset.arcs.setRetainedInterval(z);
  if (isProjectedLayer(lyr)) {
    lyr.arcs.setRetainedInterval(z);
  }
}

export function updateZ(lyr) {
  if (isProjectedLayer(lyr) && !lyr.source.dataset.arcs.isFlat()) {
    lyr.arcs.setThresholds(lyr.source.dataset.arcs.getVertexData().zz);
  }
}

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

export function getPointCoords(lyr, fid) {
  return internal.cloneShape(lyr.source.layer.shapes[fid]);
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

export function setPointCoords(lyr, fid, coords) {
  lyr.source.layer.shapes[fid] = coords;
  if (isProjectedLayer(lyr)) {
    lyr.layer.shapes[fid] = projectPointCoords(coords, lyr.projectPoint);
  }
}

export function updateVertexCoords(lyr, ids) {
  if (!isProjectedLayer(lyr)) return;
  var p = lyr.arcs.getVertex2(ids[0]);
  internal.snapVerticesToPoint(ids, lyr.invertPoint(p[0], p[1]), lyr.source.dataset.arcs, true);
}

function isProjectedLayer(lyr) {
  // TODO: could do some validation on the layer's contents
  return !!(lyr.source && lyr.invertPoint);
}

// Update data coordinates by projecting display coordinates
export function updatePointCoords(lyr, fid) {
  if (!isProjectedLayer(lyr)) return;
  var displayShp = lyr.layer.shapes[fid];
  lyr.source.layer.shapes[fid] = projectPointCoords(displayShp, lyr.invertPoint);
}

function projectPointCoords(src, proj) {
  var dest = [], p;
  for (var i=0; i<src.length; i++) {
    p = proj(src[i][0], src[i][1]);
    if (p) dest.push(p);
  }
  return dest.length ? dest : null;
}