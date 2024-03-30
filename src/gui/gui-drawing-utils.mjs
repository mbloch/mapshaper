import { internal, Bounds, utils } from './gui-core';
import { isProjectedLayer } from './gui-display-utils';
import { layerHasCanvasDisplayStyle } from './gui-map-style';
import { projectLayerForDisplay } from './gui-display-layer';
export function flattenArcs(lyr) {
  lyr.gui.source.dataset.arcs.flatten();
  if (isProjectedLayer(lyr)) {
    lyr.gui.displayArcs.flatten();
  }
}

export function setZ(lyr, z) {
  lyr.gui.source.dataset.arcs.setRetainedInterval(z);
  if (isProjectedLayer(lyr)) {
    lyr.gui.displayArcs.setRetainedInterval(z);
  }
}

export function updateZ(lyr) {
  if (isProjectedLayer(lyr) && !lyr.gui.source.dataset.arcs.isFlat()) {
    lyr.gui.displayArcs.setThresholds(lyr.gui.source.dataset.arcs.getVertexData().zz);
  }
}

export function appendNewDataRecord(layer) {
  if (!layer.data) return null;
  var fields = layer.data.getFields();
  var d = getEmptyDataRecord(layer.data);
  // TODO: handle SVG symbol layer
  if (internal.layerHasLabels(layer)) {
    d['label-text'] = 'TBD'; // without text, new labels will be invisible
  } else if (layer.geometry_type == 'point' && fields.includes('r')) {
    d.r = 3; // show a black circle if layer is styled
  }
  if (layer.geometry_type == 'polyline' || layer.geometry_type == 'polygon') {
    if (fields.includes('stroke')) d.stroke = 'black';
    if (fields.includes('stroke-width')) d['stroke-width'] = 1;
  }
  if (layer.geometry_type == 'polygon') {
    if (fields.includes('fill')) {
      d.fill = 'rgba(0,0,0,0.10)'; // 'rgba(249,120,249,0.20)';
    }
  }
  // TODO: better styling
  layer.data.getRecords().push(d);
  return d;
}

function getEmptyDataRecord(table) {
  return table.getFields().reduce(function(memo, name) {
    memo[name] = null;
    return memo;
  }, {});
}

// p1, p2: two points in source data CRS coords.
export function appendNewPath(lyr, p1, p2) {
  var arcId = lyr.gui.displayArcs.size();
  internal.appendEmptyArc(lyr.gui.displayArcs);
  lyr.shapes.push([[arcId]]);
  if (isProjectedLayer(lyr)) {
    internal.appendEmptyArc(lyr.gui.source.dataset.arcs);
  }
  appendVertex(lyr, p1);
  appendVertex(lyr, p2);
  appendNewDataRecord(lyr);
}

export function deleteLastPath(lyr) {
  var arcId = lyr.gui.displayArcs.size() - 1;
  if (lyr.data) {
    lyr.data.getRecords().pop();
  }
  var shp = lyr.shapes.pop();
  internal.deleteLastArc(lyr.gui.displayArcs);
  if (isProjectedLayer(lyr)) {
    internal.deleteLastArc(lyr.gui.source.dataset.arcs);
  }
}

// p: one point in source data coords
export function appendNewPoint(lyr, p) {
  lyr.shapes.push([p]);
  if (lyr.data) {
    appendNewDataRecord(lyr);
  }
  // this reprojects all the points... TODO: improve
  if (isProjectedLayer(lyr)) {
    projectLayerForDisplay(lyr, lyr.gui.dynamic_crs);
  }
}

export function deletePoint(lyr, fid) {
  var records = lyr.data?.getRecords();
  lyr.shapes.splice(fid, 1);
  if (records) records.splice(fid, 1);
  if (isProjectedLayer(lyr)) {
    lyr.gui.displayLayer.shapes.splice(fid, 1);
  }
}

export function insertPoint(lyr, fid, shp, d) {
  var records = lyr.data?.getRecords();
  if (records) records.splice(fid, 0, d);
  lyr.shapes.splice(fid, 0, shp);
  if (isProjectedLayer(lyr)) {
    var shp2 = projectPointCoords(shp, lyr.gui.projectPoint);
    lyr.gui.displayLayer.shapes.splice(fid, 0, shp2);
  }
}

export function deleteLastPoint(lyr) {
  if (lyr.data) {
    lyr.data.getRecords().pop();
  }
  lyr.shapes.pop();
  if (isProjectedLayer(lyr)) {
    lyr.gui.displayLayer.shapes.pop();
  }
}

// p: point in source data CRS coords.
export function insertVertex(lyr, id, p) {
  internal.insertVertex(lyr.gui.source.dataset.arcs, id, p);
  if (isProjectedLayer(lyr)) {
    internal.insertVertex(lyr.gui.displayArcs, id, lyr.gui.projectPoint(p[0], p[1]));
  }
}

export function appendVertex(lyr, p) {
  var n = lyr.gui.source.dataset.arcs.getPointCount();
  insertVertex(lyr, n, p);
}

// TODO: make sure we're not also removing an entire arc
export function deleteLastVertex(lyr) {
  deleteVertex(lyr, lyr.gui.displayArcs.getPointCount() - 1);
}


export function deleteVertex(lyr, id) {
  internal.deleteVertex(lyr.gui.displayArcs, id);
  if (isProjectedLayer(lyr)) {
    internal.deleteVertex(lyr.gui.source.dataset.arcs, id);
  }
}

export function getLastArcCoords(target) {
  var arcId = target.gui.source.dataset.arcs.size() - 1;
  return internal.getUnfilteredArcCoords(arcId, target.gui.source.dataset.arcs);
}

export function getLastVertexCoords(target) {
  var arcs = target.gui.source.dataset.arcs;
  return internal.getVertexCoords(arcs.getPointCount() - 1, arcs);
}

export function getLastArcLength(target) {
  var arcId = target.gui.source.dataset.arcs.size() - 1;
  return internal.getUnfilteredArcLength(arcId, target.gui.source.dataset.arcs);
}

export function getVertexCoords(lyr, id) {
  return lyr.gui.source.dataset.arcs.getVertex2(id);
}

// set data coords (not display coords) of one or more vertices.
export function setVertexCoords(lyr, ids, dataPoint) {
  internal.snapVerticesToPoint(ids, dataPoint, lyr.gui.source.dataset.arcs);
  if (isProjectedLayer(lyr)) {
    var p = lyr.gui.projectPoint(dataPoint[0], dataPoint[1]);
    internal.snapVerticesToPoint(ids, p, lyr.gui.displayArcs);
  }
}

export function updateVertexCoords(lyr, ids) {
  if (!isProjectedLayer(lyr)) return;
  var p = lyr.gui.displayArcs.getVertex2(ids[0]);
  internal.snapVerticesToPoint(ids, lyr.gui.invertPoint(p[0], p[1]), lyr.gui.source.dataset.arcs);
}

export function setRectangleCoords(lyr, ids, coords) {
  ids.forEach(function(id, i) {
    var p = coords[i];
    internal.snapVerticesToPoint([id], p, lyr.gui.source.dataset.arcs);
    if (isProjectedLayer(lyr)) {
      internal.snapVerticesToPoint([id], lyr.gui.projectPoint(p[0], p[1]), lyr.gui.displayArcs);
    }
  });
}

// Update source data coordinates by projecting display coordinates
export function updatePointCoords(lyr, fid) {
  if (!isProjectedLayer(lyr)) return;
  var displayShp = lyr.gui.displayLayer.shapes[fid];
  lyr.shapes[fid] = projectPointCoords(displayShp, lyr.gui.invertPoint);
}

// coords: [[x, y]] point in data CRS (not display CRS)
export function setPointCoords(lyr, fid, coords) {
  lyr.shapes[fid] = coords;
  if (isProjectedLayer(lyr)) {
    lyr.gui.displayLayer.shapes[fid] = projectPointCoords(coords, lyr.gui.projectPoint);
  }
}

// return an [[x, y]] point in data CRS
export function getPointCoords(lyr, fid) {
  var coords = lyr.geometry_type == 'point' && lyr.shapes[fid];
  if (!coords || coords.length != 1) {
    return null;
  }
  return internal.cloneShape(coords);
}

// export function getPointCoords(lyr, fid) {
//   return internal.cloneShape(lyr.shapes[fid]);
// }

function projectPointCoords(src, proj) {
  var dest = [], p;
  for (var i=0; i<src.length; i++) {
    p = proj(src[i][0], src[i][1]);
    if (p) dest.push(p);
  }
  return dest.length ? dest : null;
}

