/* @requires mapshaper-common */

internal.displacePoints = function(lyr, opts) {
  if (lyr.geometry_type != 'point') {
    stop('Expected a point layer');
  }

  var objects = internal.initDisplacementObjects(lyr.shapes, opts);

};


internal.initDisplacementObjects = function(shapes, opts) {
  return shapes.reduce(function(memo, shp, shpId) {
    var p;
    for (var i=0, n=shp && shp.length || 0; i<n; i++) {
      p = shp[i];
      memo.push({
        x0: p[0], x: p[0], y0: p[1], y: p[1]
      });
    }
  }, []);
};
