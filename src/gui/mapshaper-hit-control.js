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
    update(-1);
    selection = null;
    test = null;
  };

  mouse.on('hover', function(e) {
    var tr, p;
    if (!selection || !test || !selection.layer.data) {
      return;
    }
    if (ext.scale() < 0.5) {
      // ignore if zoomed too far out
      update(-1);
    } else {
      tr = ext.getTransform();
      p = tr.invert().transform(e.x, e.y);
      test(p[0], p[1], 1/tr.mx);
    }
  });

  function polygonTest(x, y, m) {
    var cands = findHitCandidates(x, y),
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
    var cands = findHitCandidates(x, y);
  }

  function pointTest(x, y, m) {

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
      o.properties = lyr.data.getRecords()[newId];
      o.layer.shapes.push(lyr.shapes[newId]);
    }
    hitId = newId;
    self.dispatchEvent('change', o);
  }

  function findHitCandidates(x, y, m) {
    var bounds = new Bounds(),
        arcs = selection.dataset.arcs,
        cands = [];
    selection.layer.shapes.forEach(function(shp, shpId) {
      var n = shp ? shp.length : 0,
          i;
      for (i=0; i<n; i++) {
        arcs.getSimpleShapeBounds(shp[i], bounds.empty());
        if (bounds.containsPoint(x, y)) {
          cands.push({shape: shp, id: shpId});
          break;
        }
      }
    });
    return cands;
  }
}

utils.inherit(HitControl, EventDispatcher);
