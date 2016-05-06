/* @requires mapshaper-gui-lib */

function HitControl(ext, mouse) {
  var self = new EventDispatcher();
  var prevHits = [];
  var active = false;
  var tests = {
    polygon: polygonTest,
    polyline: polylineTest,
    point: pointTest
  };
  var coords = El('#coordinate-info').hide();
  var lyr, target, test;

  ext.on('change', function() {
    // shapes may change along with map scale
    target = lyr ? lyr.getDisplayLayer() : null;
  });

  self.setLayer = function(o) {
    lyr = o;
    target = o.getDisplayLayer();
    test = tests[target.layer.geometry_type];
    coords.hide();
  };

  self.start = function() {
    active = true;
  };

  self.stop = function() {
    if (active) {
      hover([]);
      coords.text('').hide();
      active = false;
    }
  };

  mouse.on('click', function(e) {
    if (!active || !target) return;
    trigger('click', prevHits);
    gui.selectElement(coords.node());
  });

  // DISABLING: This causes problems when hovering over the info panel
  // Deselect hover shape when pointer leaves hover area
  //mouse.on('leave', function(e) {
  // hover(-1);
  //});

  mouse.on('hover', function(e) {
    var p, decimals;
    if (!active || !target) return;
    p = ext.getTransform().invert().transform(e.x, e.y);
    if (target.geographic) {
      // update coordinate readout if displaying geographic shapes
      decimals = getCoordPrecision(ext.getBounds());
      coords.text(p[0].toFixed(decimals) + ', ' + p[1].toFixed(decimals)).show();
    }
    if (test && e.hover) {
      hover(test(p[0], p[1]));
    }
  });

  // Convert pixel distance to distance in coordinate units.
  function getHitBuffer(pix) {
    var dist = pix / ext.getTransform().mx,
        scale = ext.scale();
    if (scale < 1) dist *= scale; // reduce hit threshold when zoomed out
    return dist;
  }

  function getCoordPrecision(bounds) {
    var min = Math.min(Math.abs(bounds.xmax), Math.abs(bounds.ymax)),
        decimals = Math.ceil(Math.log(min) / Math.LN10);
    return Math.max(0, 7 - decimals);
  }

  function polygonTest(x, y) {
    var dist = getHitBuffer(5),
        cands = findHitCandidates(x, y, dist),
        hits = [],
        cand, hitId;
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      if (geom.testPointInPolygon(x, y, cand.shape, target.dataset.arcs)) {
        hits.push(cand.id);
      }
    }
    if (cands.length > 0 && hits.length === 0) {
      // secondary detection: proximity, if not inside a polygon
      hits = findNearestCandidates(x, y, dist, cands, target.dataset.arcs);
    }
    return hits;
  }

  function polylineTest(x, y) {
    var dist = getHitBuffer(15),
        cands = findHitCandidates(x, y, dist);
    return findNearestCandidates(x, y, dist, cands, target.dataset.arcs);
  }

  function findNearestCandidates(x, y, dist, cands, arcs) {
    var hits = [],
        cand, candDist;
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      candDist = geom.getPointToShapeDistance(x, y, cand.shape, arcs);
      if (candDist < dist) {
        hits = [cand.id];
        dist = candDist;
      } else if (candDist == dist) {
        hits.push(cand.id);
      }
    }
    return hits;
  }

  function pointTest(x, y) {
    var dist = getHitBuffer(25),
        limitSq = dist * dist,
        hits = [];
    MapShaper.forEachPoint(target.layer.shapes, function(p, id) {
      var distSq = geom.distanceSq(x, y, p[0], p[1]);
      if (distSq < limitSq) {
        hits = [id];
        limitSq = distSq;
      } else if (distSq == limitSq) {
        hits.push(id);
      }
    });
    return hits;
  }

  function getProperties(id) {
    return target.layer.data ? target.layer.data.getRecordAt(id) : {};
  }

  function sameIds(a, b) {
    if (a.length != b.length) return false;
    for (var i=0; i<a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function trigger(event, hits) {
    self.dispatchEvent(event, {
      ids: hits,
      id: hits.length > 0 ? hits[0] : -1
    });
  }

  function hover(hits) {
    if (!sameIds(hits, prevHits)) {
      prevHits = hits;
      El('#map-layers').classed('hover', hits.length > 0);
      trigger('hover', hits);
    }
  }

  function findHitCandidates(x, y, dist) {
    var arcs = target.dataset.arcs,
        index = {},
        cands = [],
        bbox = [];
    target.layer.shapes.forEach(function(shp, shpId) {
      var cand;
      for (var i = 0, n = shp && shp.length; i < n; i++) {
        arcs.getSimpleShapeBounds2(shp[i], bbox);
        if (x + dist < bbox[0] || x - dist > bbox[2] ||
          y + dist < bbox[1] || y - dist > bbox[3]) {
          continue; // bbox non-intersection
        }
        cand = index[shpId];
        if (!cand) {
          cand = index[shpId] = {shape: [], id: shpId};
          cands.push(cand);
        }
        cand.shape.push(shp[i]);
      }
    });
    return cands;
  }

  return self;
}
