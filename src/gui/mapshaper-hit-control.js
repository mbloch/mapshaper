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

  // This causes the info panel to flicker on and off
  //mouse.on('leave', function(e) {
  // update(-1);
  //});

  mouse.on('hover', function(e) {
    var tr, p;
    if (selection && test && e.hover) {
      tr = ext.getTransform();
      p = tr.invert().transform(e.x, e.y);
      test(p[0], p[1], 1/tr.mx);
    }
  });

  function polygonTest(x, y, m) {
    var cands = findHitCandidates(x, y, 0),
        hitId = -1,
        cand;
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      if (geom.testPointInPolygon(x, y, cand.shape, selection.dataset.arcs)) {
        hitId = cand.id;
        break;
      }
    }
    update(hitId);
  }

  function polylineTest(x, y, m) {
    var dist = 15 * m,
        hitId = -1,
        cands, cand, candDist;
    if (ext.scale() < 1) {
      dist *= ext.scale(); // reduce hit threshold when zoomed out
    }
    cands = findHitCandidates(x, y, dist);
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      candDist = geom.getPointToShapeDistance(x, y, cand.shape, selection.dataset.arcs);
      if (candDist < dist) {
        hitId = cand.id;
        dist = candDist;
      }
    }
    update(hitId);
  }

  function pointTest(x, y, m) {
    var pixBuf = 25,
        hitId = -1,
        hitDist = pixBuf * pixBuf * m * m;
    MapShaper.forEachPoint(selection.layer, function(p, id) {
      var distSq = distanceSq(x, y, p[0], p[1]);
      if (distSq < hitDist) {
        hitId = id;
        hitDist = distSq;
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
    }
    selectionId = newId;
    self.dispatchEvent('change', o);
  }

  function findHitCandidates(x, y, dist) {
    var bbox = [],
        arcs = selection.dataset.arcs,
        cands = [];
    selection.layer.shapes.forEach(function(shp, shpId) {
      var n = shp ? shp.length : 0,
          i;
      for (i=0; i<n; i++) {
        arcs.getSimpleShapeBounds2(shp[i], bbox);
        if (x + dist > bbox[0] && x - dist < bbox[2] &&
          y + dist > bbox[1] && y - dist < bbox[3]) {
          cands.push({shape: shp, id: shpId});
          break;
        }
      }
    });
    return cands;
  }
}

utils.inherit(HitControl, EventDispatcher);
