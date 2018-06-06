/* @requires mapshaper-shape-utils */

// @filter  optional filter function; signature: function(idA, idB or -1):bool
internal.getArcClassifier = function(shapes, arcs, filter) {
  var n = arcs.size(),
      a = new Int32Array(n),
      b = new Int32Array(n);

  utils.initializeArray(a, -1);
  utils.initializeArray(b, -1);

  internal.traversePaths(shapes, function(o) {
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
    var shpA = a[i];
    var shpB = b[i];
    var key;
    if (shpA == -1) return null;
    key = getKey(shpA, shpB);
    if (!key) return null;
    a[i] = -1;
    b[i] = -1;
    // use optional filter to exclude some arcs
    if (filter && !filter(shpA, shpB)) return null;
    return key;
  }

  return function(getKey) {
    return function(arcId) {
      return classify(arcId, getKey);
    };
  };
};
