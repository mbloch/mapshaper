/* @requires mapshaper-arcs, mapshaper-shape-utils */

api.affine = function(layers, arcs, opts) {
  var shift = opts.shift || [0, 0];
  var flags = new Uint8Array(arcs.size());
  var allShapes = [];
  layers.filter(internal.layerHasPaths).forEach(function(lyr) {
    var shapes = lyr.shapes;
    if (opts && opts.where) {
      var test = internal.compileValueExpression(opts.where, lyr, arcs);
      shapes = shapes.filter(function(shp, i) {return test(i);});
    }
    allShapes = allShapes.concat(shapes);
  });
  internal.countArcsInShapes(allShapes, flags);
  arcs.transformPoints(function(x, y, arcId) {
    var p = [x, y];
    if (flags[arcId] > 0) {
      p[0] += shift[0];
      p[1] += shift[1];
    }
    return p;
  });
};
