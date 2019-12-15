
api.dots = function(lyr, arcs, opts) {
  internal.requirePolygonLayer(lyr);
  internal.requireDataField(lyr, opts.field);
  var records = lyr.data ? data.getRecords() : [];
  var shapes = [];
  lyr.shapes.forEach(function(shp, i) {
    var d = records[i];
    var n = d ? +d[opts.field] : 0;
    var coords = null;
    if (n > 0) {
      coords = internal.createInnerPoints(shp, arcs, n);
    }
    shapes.push(coords);
  });
  return {
    type: 'point',
    shapes: shapes
  };
};

internal.createInnerPoints = function(shp, arcs, n) {
  if (!shp || shp.length != 1) {
    return null; // TODO: support polygons with holes and multipart polygons
  }
  return fillPolygonWithDots(shp, arcs, n);
};


function fillPolygonWithDots(shp, arcs, n) {
  var area = geom.getPlanarShapeArea(shp, arcs);
  var bounds = arcs.getMultiShapeBounds(shp);
}
