/* @requires mapshaper-gui-lib */

function HitControl(ext, mouse) {

  var self = this;
  var selectionId = -1;
  var hoverId = -1;
  var pinId = -1;
  var tests = {
    polygon: polygonTest,
    polyline: polylineTest,
    point: pointTest
  };
  var selection, test;

  this.turnOn = function(o) {
    selectionId = hoverId = pinId = -1;
    selection = o;
    test = tests[o.layer.geometry_type];
  };

  this.turnOff = function() {
    if (selection) {
      pinId = -1;
      update(-1);
      selection = null;
      test = null;
    }
  };

  document.addEventListener('keydown', function(e) {
    var kc = e.keyCode, n;
    if (pinId > -1 && kc >= 37 && kc <= 40) {
      n = MapShaper.getFeatureCount(selection.layer);
      if (kc == 38 || kc == 37) {
        pinId = (pinId + n - 1) % n;
      }
      if (kc == 39 || kc == 40) {
        pinId = (pinId + 1) % n;
      }
      select(pinId);
      e.stopPropagation();
    }
  }, !!'capture');

  mouse.on('click', function(e) {
    if (!selection) return;
    if (pinId > -1 && hoverId == pinId) {
      // clicking on pinned shape: unpin
      pinId = -1;
    } else if (pinId == -1 && hoverId > -1) {
      // clicking on unpinned shape while unpinned: pin
      pinId = hoverId;
    } else if (pinId > -1 && hoverId > -1) {
      // clicking on unpinned shape while pinned: pin
      pinId = hoverId;
    } else if (pinId > -1 && hoverId == -1) {
      // clicking off the layer while pinned: unpin and deselect
      pinId = -1;
    }
    select(hoverId);
  });

  // DISABLING: This causes problems when hovering over the info panel
  // Deselect hover shape when pointer leaves hover area
  //mouse.on('leave', function(e) {
  // update(-1);
  //});

  mouse.on('hover', function(e) {
    var tr, p;
    if (selection && test && e.hover) {
      tr = ext.getTransform();
      p = tr.invert().transform(e.x, e.y);
      test(p[0], p[1]);
    }
  });

  // Convert pixel distance to distance in coordinate units.
  function getHitBuffer(pix) {
    var dist = pix / ext.getTransform().mx,
        scale = ext.scale();
    if (scale < 1) dist *= scale; // reduce hit threshold when zoomed out
    return dist;
  }

  function polygonTest(x, y) {
    var dist = getHitBuffer(5),
        cands = findHitCandidates(x, y, dist),
        hitId = -1,
        cand;
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      if (geom.testPointInPolygon(x, y, cand.shape, selection.dataset.arcs)) {
        hitId = cand.id;
        break;
      }
    }
    if (cands.length > 0 && hitId == -1) {
      // secondary detection: proximity, if not inside a polygon
      hitId = findNearestCandidate(x, y, dist, cands, selection.dataset.arcs);
    }
    update(hitId);
  }

  function polylineTest(x, y) {
    var dist = getHitBuffer(15),
        hitId = -1,
        cands = findHitCandidates(x, y, dist);
    hitId = findNearestCandidate(x, y, dist, cands, selection.dataset.arcs);
    update(hitId);
  }

  function findNearestCandidate(x, y, dist, cands, arcs) {
    var hitId = -1,
        cand, candDist;
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      candDist = geom.getPointToShapeDistance(x, y, cand.shape, arcs);
      if (candDist < dist) {
        hitId = cand.id;
        dist = candDist;
      }
    }
    return hitId;
  }

  function pointTest(x, y) {
    var dist = getHitBuffer(25),
        limitSq = dist * dist,
        hitId = -1;
    MapShaper.forEachPoint(selection.layer, function(p, id) {
      var distSq = distanceSq(x, y, p[0], p[1]);
      if (distSq < limitSq) {
        hitId = id;
        limitSq = distSq;
      }
    });
    update(hitId);
  }

  function getProperties(id) {
    return selection.layer.data ? selection.layer.data.getRecords()[id] : {};
  }

  function update(newId) {
    hoverId = newId;

    if (pinId == -1 && hoverId != selectionId) {
      select(newId);
    }
    El('#map-layers').classed('hover', hoverId > -1);
  }

  function select(newId) {
    var o = {
      pinned: pinId > -1,
      id: newId,
      dataset: selection.dataset,
      layer: {
        geometry_type: selection.layer.geometry_type,
        shapes: []
      }
    };
    if (newId > -1) {
      o.properties = getProperties(newId);
      o.layer.shapes.push(selection.layer.shapes[newId]);
      o.table = selection.layer.data;
    }
    selectionId = newId;
    self.dispatchEvent('change', o);
  }

  function findHitCandidates(x, y, dist) {
    var arcs = selection.dataset.arcs,
        index = {},
        cands = [],
        bbox = [];
    selection.layer.shapes.forEach(function(shp, shpId) {
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
}

utils.inherit(HitControl, EventDispatcher);
