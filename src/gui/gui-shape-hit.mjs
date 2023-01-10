import { utils, geom, internal, error } from './gui-core';
import { absArcId } from '../paths/mapshaper-arc-utils';

export function getShapeHitTest(displayLayer, ext, interactionMode) {
  var geoType = displayLayer.layer.geometry_type;
  var test;
  if (geoType == 'point' && displayLayer.style.type == 'styled') {
    test = getGraduatedCircleTest(getRadiusFunction(displayLayer.style));
  } else if (geoType == 'point') {
    test = pointTest;
  } else if (interactionMode == 'vertices') {
    test = vertexTest;
  } else if (geoType == 'polyline') {
    test = polylineTest;
  } else if (geoType == 'polygon') {
    test = polygonTest;
  } else {
    error("Unexpected geometry type:", geoType);
  }
  return test;

  // Convert pixel distance to distance in coordinate units.
  function getHitBuffer(pix) {
    return pix / ext.getTransform().mx;
  }

  // reduce hit threshold when zoomed out
  function getZoomAdjustedHitBuffer(pix, minPix) {
    var scale = ext.scale();
    if (scale < 1) {
      pix *= scale;
    }
    if (minPix > 0 && pix < minPix) pix = minPix;
    return getHitBuffer(pix);
  }

  function polygonTest(x, y) {
    var maxDist = getZoomAdjustedHitBuffer(10, 1),
        cands = findHitCandidates(x, y, maxDist),
        hits = [],
        cand, hitId;
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      if (geom.testPointInPolygon(x, y, cand.shape, displayLayer.arcs)) {
        hits.push(cand);
      }
    }
    if (cands.length > 0 && hits.length === 0) {
      // secondary detection: proximity, if not inside a polygon
      sortByDistance(x, y, cands, displayLayer.arcs);
      hits = pickNearestCandidates(cands, 0, maxDist);
    }
    return {
      ids: utils.pluck(hits, 'id')
    };
  }

  function pickNearestCandidates(sorted, bufDist, maxDist) {
    var hits = [],
        cand, minDist;
    for (var i=0; i<sorted.length; i++) {
      cand = sorted[i];
      if (cand.dist < maxDist !== true) {
        break;
      } else if (i === 0) {
        minDist = cand.dist;
      } else if (cand.dist - minDist > bufDist) {
        break;
      }
      hits.push(cand);
    }
    return hits;
  }

  function vertexTest(x, y) {
    var maxDist = getZoomAdjustedHitBuffer(25, 2),
        cands = findHitCandidates(x, y, maxDist);
    sortByDistance(x, y, cands, displayLayer.arcs);
    cands = pickNearestCandidates(cands, 0, maxDist);
    return {
      ids: utils.pluck(cands, 'id')
    };
  }

  function polylineTest(x, y) {
    var maxDist = getZoomAdjustedHitBuffer(15, 2),
        bufDist = getZoomAdjustedHitBuffer(0.05), // tiny threshold for hitting almost-identical lines
        cands = findHitCandidates(x, y, maxDist);
    sortByDistance(x, y, cands, displayLayer.arcs);
    cands = pickNearestCandidates(cands, bufDist, maxDist);
    return {
      ids: utils.pluck(cands, 'id')
    };
  }

  function sortByDistance(x, y, cands, arcs) {
    var cand;
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      cand.info = geom.getPointToShapeInfo(x, y, cands[i].shape, arcs);
      cand.dist = cand.info.distance;
    }
    utils.sortOn(cands, 'dist');
  }

  function pointTest(x, y) {
    var bullseyeDist = 2, // hit all points w/in 2 px
        hitThreshold = 25,
        toPx = ext.getTransform().mx,
        hits = [];

    // inlining forEachPoint() does not not appreciably speed this up
    internal.forEachPoint(displayLayer.layer.shapes, function(p, id) {
      var dist = geom.distance2D(x, y, p[0], p[1]) * toPx;
      if (dist > hitThreshold) return;
      if (dist < hitThreshold && hitThreshold > bullseyeDist) {
        hits = [];
        hitThreshold = Math.max(bullseyeDist, dist);
      }
      hits.push(id);
    });
    // TODO: add info on what part of a shape gets hit?
    return {
      ids: utils.uniq(hits) // multipoint features can register multiple hits
    };
  }

  function getRadiusFunction(style) {
    var o = {};
    if (style.styler) {
      return function(i) {
        style.styler(o, i);
        return o.radius || 0;
      };
    }
    return function() {return style.radius || 0;};
  }

  function getGraduatedCircleTest(radius) {
    return function(x, y) {
      var hits = [],
          margin = getHitBuffer(12),
          limit = getHitBuffer(50), // short-circuit hit test beyond this threshold
          directHit = false,
          hitRadius = 0,
          hitDist;
      internal.forEachPoint(displayLayer.layer.shapes, function(p, id) {
        var distSq = geom.distanceSq(x, y, p[0], p[1]);
        var isHit = false;
        var isOver, isNear, r, d, rpix;
        if (distSq > limit * limit) return;
        rpix = radius(id);
        r = getHitBuffer(rpix + 1); // increase effective radius to make small bubbles easier to hit in clusters
        d = Math.sqrt(distSq) - r; // pointer distance from edge of circle (negative = inside)
        isOver = d < 0;
        isNear = d < margin;
        if (!isNear || rpix > 0 === false) {
          isHit = false;
        } else if (hits.length === 0) {
          isHit = isNear;
        } else if (!directHit && isOver) {
          isHit = true;
        } else if (directHit && isOver) {
          isHit = r == hitRadius ? d <= hitDist : r < hitRadius; // smallest bubble wins if multiple direct hits
        } else if (!directHit && !isOver) {
          // closest to bubble edge wins
          isHit = hitDist == d ? r <= hitRadius : d < hitDist; // closest bubble wins if multiple indirect hits
        }
        if (isHit) {
          if (hits.length > 0 && (r != hitRadius || d != hitDist)) {
            hits = [];
          }
          hitRadius = r;
          hitDist = d;
          directHit = isOver;
          hits.push(id);
        }
      });
      return {
        ids: hits
      };
    };
  }

  function findHitCandidates(x, y, dist) {
    var arcs = displayLayer.arcs,
        index = {},
        cands = [],
        bbox = [];
    displayLayer.layer.shapes.forEach(function(shp, shpId) {
      var cand;
      for (var i = 0, n = shp && shp.length; i < n; i++) {
        arcs.getSimpleShapeBounds2(shp[i], bbox);
        if (x + dist < bbox[0] || x - dist > bbox[2] ||
          y + dist < bbox[1] || y - dist > bbox[3]) {
          continue; // bbox non-intersection
        }
        cand = index[shpId];
        if (!cand) {
          cand = index[shpId] = {shape: [], id: shpId, dist: 0};
          cands.push(cand);
        }
        cand.shape.push(shp[i]);
      }
    });
    return cands;
  }
}
