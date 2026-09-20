import { internal, geom } from './gui-core';
import { translateDisplayPoint } from './gui-display-utils';
import { showPopupAlert } from './gui-alert';
import { snipPath } from './gui-snipping-utils';

// pixel distance threshold for hovering near a vertex or a segment
var HOVER_THRESHOLD = 10;

export function initSnipTool(gui, ext, hit) {
  var hoverInfo = null;
  var pendingCut = null; // first of the two cuts needed to divide a ring
  var sessionCount = 0;
  var alert;

  function active() {
    return gui.interaction.getMode() == 'snip_lines' && !!hit.getHitTarget();
  }

  gui.on('interaction_mode_change', function(e) {
    if (e.mode == 'snip_lines') {
      turnOn();
    } else {
      turnOff();
    }
    updateCursor();
  }, null, 10); // higher priority than hit control, so turnOff() has correct hit target

  gui.on('undo_redo_pre', function() {
    clearPendingCut();
    hoverInfo = null;
  });

  // A pending cut describes a location in the target layer's current geometry,
  // and choosing one does not change the model -- so any model update means
  // something else has happened and the cut is stale.
  gui.model.on('update', function() {
    clearPendingCut();
    hoverInfo = null;
  });

  function turnOn() {
    hoverInfo = null;
    if (sessionCount === 0) {
      showInstructions();
    }
    sessionCount++;
  }

  function turnOff() {
    clearPendingCut();
    clearHoverVertex();
    hideInstructions();
  }

  function showInstructions() {
    var msg = 'Click a line to snip it apart. Snipping a ring ' +
      'takes two clicks -- the ring divides at the second one.';
    alert = showPopupAlert(msg, null, {non_blocking: true, max_width: '350px'});
  }

  function hideInstructions() {
    if (!alert) return;
    alert.close('fade');
    alert = null;
  }

  function clearHoverVertex() {
    hit.clearHoverVertex();
    hoverInfo = null;
  }

  function clearPendingCut() {
    if (!pendingCut) return;
    pendingCut = null;
    hit.clearPendingSnip();
  }

  function setPendingCut(info) {
    pendingCut = info;
    hit.setPendingSnip(info.markerPoint);
  }

  // The pending cut is described in terms of the target layer's current arcs
  // and feature ids, so it has to be discarded if either could have changed.
  function pendingCutIsValid() {
    return !!pendingCut && pendingCut.target === hit.getHitTarget();
  }

  hit.on('hover', function(e) {
    if (!active()) return;
    if (pendingCut && !pendingCutIsValid()) {
      clearPendingCut();
    }
    hoverInfo = e.id >= 0 ? findSnipTarget(e) : null;
    if (hoverInfo) {
      hit.setHoverVertex(hoverInfo.markerPoint,
        hoverInfo.disabled ? 'disabled' : hoverInfo.type);
    } else {
      hit.clearHoverVertex();
    }
    if (pendingCut) {
      hit.setPendingSnip(pendingCut.markerPoint);
    }
    updateCursor();
  }, null, 100);

  hit.on('click', function(e) {
    var info = hoverInfo;
    var cuts;
    if (!active() || !info || info.disabled) return;
    // a snip invalidates the hover data (feature ids and arcs both change), so
    // clear it -- this also makes the second click of a double-click a no-op
    hoverInfo = null;
    if (!info.ring) {
      clearPendingCut();
      snip(info, [info.cut]);
      return;
    }
    if (!pendingCutIsValid() || pendingCut.fid !== info.fid ||
        pendingCut.partId !== info.partId) {
      // first cut on this ring: remember it, don't change any geometry
      setPendingCut(info);
      return;
    }
    if (cutsAreAdjacent(pendingCut, info)) {
      clearPendingCut(); // clicking the pending cut again cancels it
      return;
    }
    cuts = [pendingCut.cut, info.cut];
    clearPendingCut();
    snip(info, cuts);
  });

  gui.keyboard.on('keydown', function(e) {
    if (!active() || !pendingCut || e.keyName != 'esc') return;
    e.stopPropagation();
    e.originalEvent.preventDefault();
    clearPendingCut();
  }, null, 10);

  function snip(info, cuts) {
    var target = hit.getHitTarget();
    var result = snipPath(target, info.fid, info.partId, cuts);
    if (!result) return;
    gui.dispatchEvent('snip', {target: target, result: result});
    hit.clearHoverVertex();
    hideInstructions();
    gui.model.updated({arc_count: true}); // update display arcs and redraw
  }

  // Test if two cuts are close enough on screen to be treated as the same place
  function cutsAreAdjacent(a, b) {
    var dist = geom.distance2D(a.markerPoint[0], a.markerPoint[1],
      b.markerPoint[0], b.markerPoint[1]);
    return dist / ext.getPixelSize() < HOVER_THRESHOLD;
  }

  function updateCursor() {
    var el = gui.container.findChild('.map-layers');
    el.classed('snip-tool', active());
    el.classed('no-snip', !!(hoverInfo && hoverInfo.disabled));
  }

  // Find the snip location under the pointer: the nearest vertex within the
  // hover threshold, or failing that the nearest point on a segment.
  // Returns null if the pointer is not close enough to the hit feature.
  function findSnipTarget(e) {
    var target = hit.getHitTarget();
    var shp = target && target.shapes[e.id];
    var arcs = target && target.gui.displayArcs;
    var bestVertex = null;
    var bestSegment = null;
    var p, threshold, data;
    if (!shp || !arcs) return null;
    p = ext.pixCoordsToMapCoords(e.x, e.y);
    threshold = HOVER_THRESHOLD * ext.getPixelSize();
    data = arcs.getVertexData();

    shp.forEach(function(path, partId) {
      path.forEach(function(arcId, seq) {
        var absId = internal.absArcId(arcId);
        var fwd = arcId >= 0;
        var start = data.ii[absId];
        var n = data.nn[absId];
        var i, v1, v2, dist, p2;
        if (arcIsOutOfRange(data.bb, absId, p, threshold)) return;
        for (i=0; i<n; i++) {
          v1 = fwd ? start + i : start + n - 1 - i;
          dist = geom.distance2D(p[0], p[1], data.xx[v1], data.yy[v1]);
          if (dist < threshold && (!bestVertex || dist < bestVertex.dist)) {
            bestVertex = {partId: partId, seq: seq, offset: i, dist: dist, vid: v1};
          }
          if (i === n - 1) break;
          v2 = fwd ? v1 + 1 : v1 - 1;
          p2 = internal.findClosestPointOnSeg(p[0], p[1], data.xx[v1],
            data.yy[v1], data.xx[v2], data.yy[v2], 0);
          dist = geom.distance2D(p[0], p[1], p2[0], p2[1]);
          if (dist < threshold && (!bestSegment || dist < bestSegment.dist)) {
            bestSegment = {
              partId: partId, seq: seq, offset: i, dist: dist, displayPoint: p2,
              t: getSegmentPosition(data.xx[v1], data.yy[v1], data.xx[v2],
                data.yy[v2], p2)
            };
          }
        }
      });
    });

    if (bestVertex) return getVertexTarget(target, e.id, bestVertex);
    if (bestSegment) return getSegmentTarget(target, e.id, bestSegment);
    return null;
  }

  function getVertexTarget(target, fid, info) {
    var displayPoint = target.gui.displayArcs.getVertex2(info.vid);
    return {
      target: target,
      fid: fid,
      partId: info.partId,
      type: 'vertex',
      ring: pathIsRing(target, fid, info.partId),
      disabled: !pathIsRing(target, fid, info.partId) &&
        vertexIsPathEndpoint(target, fid, info),
      markerPoint: displayPoint,
      cut: {seq: info.seq, offset: info.offset, point: null, displayPoint: null, t: 0}
    };
  }

  function getSegmentTarget(target, fid, info) {
    return {
      target: target,
      fid: fid,
      partId: info.partId,
      type: 'interpolated',
      ring: pathIsRing(target, fid, info.partId),
      disabled: false,
      markerPoint: info.displayPoint,
      cut: {
        seq: info.seq,
        offset: info.offset,
        point: translateDisplayPoint(target, info.displayPoint),
        displayPoint: info.displayPoint,
        t: info.t
      }
    };
  }

  function pathIsRing(target, fid, partId) {
    return geom.pathIsClosed(target.shapes[fid][partId], target.gui.displayArcs);
  }

  // Test if a vertex is one of the two endpoints of an open path (as opposed to
  // an interior node between two of the path's arcs, which is snippable).
  function vertexIsPathEndpoint(target, fid, info) {
    var path = target.shapes[fid][info.partId];
    var data = target.gui.displayArcs.getVertexData();
    var lastId = internal.absArcId(path[path.length - 1]);
    if (info.seq === 0 && info.offset === 0) return true;
    return info.seq === path.length - 1 && info.offset === data.nn[lastId] - 1;
  }
}

// Test if an arc's bounding box is too far from a point to contain a hit
function arcIsOutOfRange(bb, arcId, p, dist) {
  var i = arcId * 4;
  return p[0] + dist < bb[i] || p[0] - dist > bb[i + 2] ||
    p[1] + dist < bb[i + 1] || p[1] - dist > bb[i + 3];
}

// Position of point p along the segment from (x1, y1) to (x2, y2), as a
// fraction of the segment's length
function getSegmentPosition(x1, y1, x2, y2, p) {
  var len = geom.distance2D(x1, y1, x2, y2);
  return len > 0 ? geom.distance2D(x1, y1, p[0], p[1]) / len : 0;
}
