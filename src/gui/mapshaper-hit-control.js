/* @requires mapshaper-gui-lib */

function HitControl(ext, mouse) {
  var self = this;
  var hitId = -1;
  var tests = {
    polygon: polygonTest,
    polyline: polylineTest,
    point: pointTest
  };
  var selection, test;

  this.turnOn = function(o) {
    hitId = -1;
    selection = o;
    test = tests[o.layer.geometry_type];
  };

  this.turnOff = function() {
    if (selection) {
      update(-1);
      selection = null;
      test = null;
    }
  };

  mouse.on('click', function() {
    if (hitId > -1) {
      self.dispatchEvent('click', {id: hitId, properties: getProperties(hitId)});
    }
  });

  mouse.on('hover', function(e) {
    var tr, p;
    if (!selection || !test) {
      return;
    }
    if (ext.scale() < 0.2) {
      // ignore if zoomed too far out
      update(-1);
    } else {
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
    var pixBuf = 15,
        hitDist = pixBuf * m,
        hitId = -1,
        cands = findHitCandidates(x, y, pixBuf * m),
        candDist;
    for (var i=0; i<cands.length; i++) {
      cand = cands[i];
      candDist = geom.getPointToShapeDistance(x, y, cand.shape, selection.dataset.arcs);
      if (candDist < hitDist) {
        hitId = cand.id;
        hitDist = candDist;
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
    var lyr = selection.layer,
        o;
    if (newId == hitId) return;
    o = {
      id: newId,
      dataset: selection.dataset,
      layer: {
        geometry_type: lyr.geometry_type,
        shapes: []
      }
    };
    if (newId > -1) {
      o.properties = getProperties(newId);
      o.layer.shapes.push(lyr.shapes[newId]);
    }
    hitId = newId;
    self.dispatchEvent('change', o);
  }

  function findHitCandidates(x, y, dist) {
    var bounds = new Bounds(),
        buf = new Bounds(x-dist, y-dist, x+dist, y+dist),
        arcs = selection.dataset.arcs,
        cands = [];
    selection.layer.shapes.forEach(function(shp, shpId) {
      var n = shp ? shp.length : 0,
          i;
      for (i=0; i<n; i++) {
        arcs.getSimpleShapeBounds(shp[i], bounds.empty());
        if (bounds.intersects(buf)) {
          cands.push({shape: shp, id: shpId});
          break;
        }
      }
    });
    return cands;
  }
}

utils.inherit(HitControl, EventDispatcher);
