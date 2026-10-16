import { internal, Bounds, utils, error } from './gui-core';
import { isProjectedLayer } from './gui-display-utils';
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

// Ids of the shapes with an arc containing one of vertices @vertexIds: the
// shapes that moving the vertices changes, including any that share an arc
export function findShapesWithVertices(shapes, vertexIds, arcs) {
  var ii = arcs.getVertexData().ii;
  var arcIds = {};
  var ids = [];
  vertexIds.forEach(function(v) {
    arcIds[internal.findArcIdFromVertexId(v, ii)] = true;
  });
  for (var i = 0; i < shapes.length; i++) {
    if (shapeUsesArcs(shapes[i], arcIds)) ids.push(i);
  }
  return ids;
}

function shapeUsesArcs(shp, arcIds) {
  var i, j;
  for (i = 0; shp && i < shp.length; i++) {
    for (j = 0; j < shp[i].length; j++) {
      if (arcIds[internal.absArcId(shp[i][j])] === true) return true;
    }
  }
  return false;
}

// Vertex ids @ids, found by position, without those on arcs that no path layer
// in @layers uses -- such as the arc a line reshaped with -update-line leaves
// behind, which is still in the arc collection, and which would otherwise
// make the end of the reshaped line look like a junction. Arcs are only
// counted for more than one id, which is the only case they can change.
export function removeUnusedArcVertices(ids, arcs, layers) {
  var counts, ii, used;
  if (ids.length < 2) return ids;
  counts = new Uint32Array(arcs.size());
  ii = arcs.getVertexData().ii;
  layers.forEach(function(lyr) {
    if (lyr.geometry_type == 'polyline' || lyr.geometry_type == 'polygon') {
      internal.countArcsInShapes(lyr.shapes, counts);
    }
  });
  used = ids.filter(function(id) {
    return counts[internal.findArcIdFromVertexId(id, ii)] > 0;
  });
  return used.length > 0 ? used : ids;
}

// The vertices of each part of shapes @ids, as [[x, y], ...] paths
export function getShapePaths(shapes, ids, arcs) {
  var paths = [];
  ids.forEach(function(id) {
    (shapes[id] || []).forEach(function(part) {
      var iter = arcs.getShapeIter(part);
      var path = [];
      while (iter.hasNext()) path.push([iter.x, iter.y]);
      if (path.length > 1) paths.push(path);
    });
  });
  return paths;
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
export function appendNewPath(lyr, points) {
  var arcId = lyr.gui.displayArcs.size();
  internal.appendEmptyArc(lyr.gui.displayArcs);
  lyr.shapes.push([[arcId]]);
  if (isProjectedLayer(lyr)) {
    internal.appendEmptyArc(lyr.gui.source.dataset.arcs);
  }
  points.forEach(function(p) {
    appendVertex(lyr, p);
  });
  appendNewDataRecord(lyr);
}


// Divide an arc at one or two cut locations, appending the pieces to the end of
// the arc collection (the original arc is left in place).
// cuts: cut descriptors ordered from the start of the arc, each containing an
//   arc-relative vertex offset plus source and display coordinates of the cut
//   location (both null when cutting at an existing vertex).
// Returns the ids of the new arcs.
export function splitArc(lyr, arcId, cuts) {
  var ids = internal.splitArcAtCuts(lyr.gui.source.dataset.arcs, arcId,
    cuts.map(function(cut) {
      return {offset: cut.offset, point: cut.point || null};
    }));
  if (isProjectedLayer(lyr)) {
    internal.splitArcAtCuts(lyr.gui.displayArcs, arcId,
      cuts.map(function(cut) {
        return {offset: cut.offset, point: cut.displayPoint || null};
      }));
  }
  return ids;
}

export function deleteLastArcs(lyr, count) {
  for (var i=0; i<count; i++) {
    internal.deleteLastArc(lyr.gui.source.dataset.arcs);
    if (isProjectedLayer(lyr)) {
      internal.deleteLastArc(lyr.gui.displayArcs);
    }
  }
}

// Add a path feature to the end of a layer.
// shp: an array of parts; rec: an attribute record, or null for an empty one
export function appendFeature(lyr, shp, rec) {
  lyr.shapes.push(shp);
  if (lyr.data) {
    lyr.data.getRecords().push(rec || getEmptyDataRecord(lyr.data));
  }
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

export function deleteFeature(lyr, fid) {
  var records = lyr.data?.getRecords();
  if (records) records.splice(fid, 1);
  lyr.shapes.splice(fid, 1);
  if (isProjectedLayer(lyr) && lyr.geometry_type == 'point') {
    lyr.gui.displayLayer.shapes.splice(fid, 1); // point layer
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

