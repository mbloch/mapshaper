import { getArcClassifier } from '../topology/mapshaper-arc-classifier';
import { forEachArcId } from '../paths/mapshaper-path-utils';

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
export function getNeighborLookupFunction(lyr, arcs) {
  var classifier = getArcClassifier(lyr, arcs, {reusable: true});
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
      forEachArcId(lyr.shapes[shpId], onArc);
      callback = null;
    } else {
      neighbors = [];
      forEachArcId(lyr.shapes[shpId], onArc);
      return neighbors;
    }
  };
}


// Returns an array containing all pairs of adjacent shapes
// in a collection of polygon shapes. A pair of shapes is represented as
// an array of two shape indexes [a, b].
export function findPairsOfNeighbors(lyr, arcs) {
  var getKey = function(a, b) {
    return b > -1 && a > -1 ? [a, b] : null;
  };
  var classify = getArcClassifier(lyr, arcs)(getKey);
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
  forEachArcId(lyr.shapes, onArc);
  return arr;
}
