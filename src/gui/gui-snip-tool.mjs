// TODO: support snipping rings (by snipping in two places)

import { internal, geom } from './gui-core';
import { translateDisplayPoint } from './gui-display-utils';
import {
  getVertexCoords,
  insertVertex
  } from './gui-drawing-utils';

import {
  snipLineAtVertex,
  mergeLinesAtVertex
} from './gui-snipping-utils';

// pixel distance threshold for hovering near a vertex or segment midpoint
var HOVER_THRESHOLD = 10;

export function initSnipTool(gui, ext, hit) {
  var _active = true;
  var hoverVertexInfo;
  var prevHoverEvent;

  gui.on('interaction_mode_change', function(e) {
    if (active()) {
      turnOff();
    }
    // updateCursor();
  }, null, 10); // higher priority than hit control, so turnOff() has correct hit target


  // hover event highlights the nearest point in close proximity to the pointer
  // ... or the closest point along the segment (for adding a new vertex)
  hit.on('hover', function(e) {
    if (!active()) return;

    // highlight nearby snappable vertex (the closest vertex on a nearby line,
    //   or the first vertex of the current drawing path if not near a line)
    hoverVertexInfo = e.id >= 0 && findDraggableVertices(e) ||
        e.id >= 0 && findInterpolatedPoint(e);
    if (hoverVertexInfo) {
      // hovering near a vertex: highlight the vertex
      hit.setHoverVertex(hoverVertexInfo.displayPoint, hoverVertexInfo.type);
    } else {
      clearHoverVertex();
    }
    // updateCursor();
    prevHoverEvent = e;
  }, null, 100);

  hit.on('click', function(e) {
    if (!active() || !hoverVertexInfo) return;
    var target = hit.getHitTarget();
    if (vertexIsEndpoint(hoverVertexInfo, target)) {
      // TODO: don't allow hovering on endpoints
      return;
    }

    if (hoverVertexInfo.type == 'interpolated') {
      insertVertex(target, hoverVertexInfo.i, hoverVertexInfo.point);
      hoverVertexInfo.ids = [hoverVertexInfo.i];
    }

    snipLineAtVertex(target, e.id, hoverVertexInfo.ids[0]);

    hit.setHoverVertex(hoverVertexInfo.displayPoint, hoverVertexInfo.type);

  });

  // return data on the nearest vertex (or identical vertices) to the pointer
  // (if within a distance threshold)
  //
  function findDraggableVertices(e) {
    var target = hit.getHitTarget();
    var shp = target.shapes[e.id];
    var p = ext.pixCoordsToMapCoords(e.x, e.y);
    var ids = internal.findNearestVertices(p, shp, target.gui.displayArcs);
    var p2 = target.gui.displayArcs.getVertex2(ids[0]);
    var dist = geom.distance2D(p[0], p[1], p2[0], p2[1]);
    var pixelDist = dist / ext.getPixelSize();
    if (pixelDist > HOVER_THRESHOLD) {
      return null;
    }
    var point = getVertexCoords(target, ids[0]); // data coordinates
    var displayPoint = target.gui.displayArcs.getVertex2(ids[0]);
    return {target, ids, point, displayPoint, type: 'vertex'};
  }

  function findInterpolatedPoint(e) {
    var target = hit.getHitTarget();
    //// vertex insertion not supported with simplification
    // if (!target.arcs.isFlat()) return null;
    var p = ext.pixCoordsToMapCoords(e.x, e.y);
    var minDist = Infinity;
    var shp = target.shapes[e.id];
    var closest;
    internal.forEachSegmentInShape(shp, target.gui.displayArcs, function(i, j, xx, yy) {
      var x1 = xx[i],
          y1 = yy[i],
          x2 = xx[j],
          y2 = yy[j],
          p2 = internal.findClosestPointOnSeg(p[0], p[1], x1, y1, x2, y2, 0),
          dist = geom.distance2D(p2[0], p2[1], p[0], p[1]);
      if (dist < minDist) {
        minDist = dist;
        closest = {
          i: (i < j ? i : j) + 1, // insertion vertex id
          displayPoint: p2,
          distance: dist
        };
      }
    });

    if (closest.distance / ext.getPixelSize() > HOVER_THRESHOLD) {
      return null;
    }
    closest.point = translateDisplayPoint(target, closest.displayPoint);
    closest.type = 'interpolated';
    closest.target = target;
    return closest;
  }

  function vertexIsEndpoint(info, target) {
    var vId = info.ids[0];
    return internal.vertexIsArcStart(vId, target.gui.displayArcs) ||
      internal.vertexIsArcEnd(vId, target.gui.displayArcs);
  }

  function clearHoverVertex() {
    hit.clearHoverVertex();
    hoverVertexInfo = null;
  }

  function active() {
    return _active && gui.interaction.getMode() == 'snip_lines';
  }

  function turnOff() {

  }

}

