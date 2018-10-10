/* @requires mapshaper-common */

internal.getBoundsSearchFunction = function(boxes) {
  var index, Flatbush;
  if (!boxes.length) {
    // Unlike rbush, flatbush doesn't allow size 0 indexes; workaround
    return function() {return [];};
  }
  Flatbush = require('flatbush');
  index = new Flatbush(boxes.length);
  boxes.forEach(function(ring) {
    var b = ring.bounds;
    index.add(b.xmin, b.ymin, b.xmax, b.ymax);
  });
  index.finish();

  return function(a, b, c, d) {
    return index.search(a, b, c, d).map(function(i) {
      return boxes[i];
    });
  };
};
