/* @requires mapshaper-shape-utils, mapshaper-arc-classifier */

// Returns a function for querying the neighbors of a given shape. The function
// can be called in either of two ways:
//
// 1. function(shapeId, callback)
//    Callback signature: function(adjacentShapeId, arcId)
//    The callback function is called once for each arc that the given feature
//    shares with another feature.
//
// 2. function(shapeId)
//    The function returns an array of unique ids of neighboring shapes, or
//    an empty array if a shape has no neighbors.
//
internal.getNeighborLookupFunction = function(lyr, arcs) {
  var classifier = internal.getArcClassifier(lyr.shapes, arcs, {reusable: true});
  var classify = classifier(onShapes);
  var currShapeId;
  var neighbors;
  var callback;

  function onShapes(a, b) {
    if (b == -1) return -1; // outer edges are b == -1
    return a == currShapeId ? b : a;
  }

  function onArc(arcId) {
    var nabeId = classify(arcId);
    if (nabeId == -1) return;
    if (callback) {
      callback(nabeId, arcId);
    } else if (neighbors.indexOf(nabeId) == -1) {
      neighbors.push(nabeId);
    }
  }

  return function(shpId, cb) {
    currShapeId = shpId;
    if (cb) {
      callback = cb;
      internal.forEachArcId(lyr.shapes[shpId], onArc);
      callback = null;
    } else {
      neighbors = [];
      internal.forEachArcId(lyr.shapes[shpId], onArc);
      return neighbors;
    }
  };
};

// Returns a lookup table mapping shape ids to arrays of ids of adjacent shapes
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
