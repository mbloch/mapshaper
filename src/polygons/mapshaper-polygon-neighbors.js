/* @requires mapshaper-shape-utils, mapshaper-arc-classifier */

internal.findNeighbors = function(shapes, arcs) {
  var getKey = function(a, b) {
    return b > -1 && a > -1 ? [a, b] : null;
  };
  var classify = internal.getArcClassifier(shapes, arcs)(getKey);
  var arr = [];
  var index = {};
  var onArc = function(arcId) {
    var obj = classify(arcId);
    var key;
    if (obj) {
      key = obj.join('~');
      if (key in index === false) {
        arr.push(obj);
        index[key] = true;
      }
    }
  };
  internal.forEachArcId(shapes, onArc);
  return arr;
};
