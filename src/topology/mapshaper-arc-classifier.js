/* @requires mapshaper-shape-utils */

MapShaper.getArcClassifier = function(shapes, arcs) {
  var n = arcs.size(),
      a = new Int32Array(n),
      b = new Int32Array(n);

  utils.initializeArray(a, -1);
  utils.initializeArray(b, -1);

  MapShaper.traversePaths(shapes, function(o) {
    var i = absArcId(o.arcId);
    var shpId = o.shapeId;
    var aval = a[i];
    if (aval == -1) {
      a[i] = shpId;
    } else if (shpId < aval) {
      b[i] = aval;
      a[i] = shpId;
    } else {
      b[i] = shpId;
    }
  });

  function classify(arcId, getKey) {
    var i = absArcId(arcId);
    var key = null;
    if (a[i] > -1) {
      key = getKey(a[i], b[i]);
      if (key) {
        a[i] = -1;
        b[i] = -1;
      }
    }
    return key;
  }

  return function(getKey) {
    return function(arcId) {
      return classify(arcId, getKey);
    };
  };
};
