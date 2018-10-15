/* @requires mapshaper-common */

// Returns a search function
// Receives array of objects to index; objects must have a 'bounds' member
//    that is a Bounds object.
internal.getBoundsSearchFunction2 = function(boxes) {
  var index, rbush, items;
  if (!boxes.length) {
    return function() {return [];};
  }
  rbush = require('rbush'); // this version uses rbush instead of flatbush
  index = rbush();
  items = boxes.map(function(ring, i) {
    var b = ring.bounds;
    return {
      i: i,
      minX: b.xmin,
      minY: b.ymin,
      maxX: b.xmax,
      maxY: b.ymax
    };
  });
  index.load(items);
  items = null;

  function itemToObj(o) {
    return boxes[o.i];
  }

  // Receives xmin, ymin, xmax, ymax parameters
  // Returns subset of original @bounds array
  return function(a, b, c, d) {
    return index.search({
      minX: a,
      minY: b,
      maxX: c,
      maxY: d
    }).map(itemToObj);
  };
};
