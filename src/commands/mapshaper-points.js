/* @requires mapshaper-data-table, mapshaper-dataset-utils, mapshaper-centroid */

api.createPointLayer = function(srcLyr, arcs, opts) {
  var destLyr = {geometry_type: 'point'};

  destLyr.shapes = opts.x || opts.y ?
      MapShaper.pointsFromDataTable(srcLyr.data, opts) :
      MapShaper.pointsFromPolygons(srcLyr, arcs, opts);

  var nulls = destLyr.shapes.reduce(function(sum, shp) {
    if (!shp) sum++;
    return sum;
  }, 0);

  if (nulls > 0) {
    message(utils.format('[points] %d/%d points are null', nulls, destLyr.shapes.length));
  }
  if (srcLyr.data) {
    destLyr.data = opts.no_replace ? srcLyr.data.clone() : srcLyr.data;
  }
  return destLyr;
};

MapShaper.pointsFromPolygons = function(lyr, arcs, opts) {
  if (lyr.geometry_type != "polygon") {
    stop("[points] expected a polygon layer");
  }
  var func = opts.inner ? geom.findInteriorPoint : geom.getShapeCentroid;
  return lyr.shapes.map(function(shp) {
    var p = func(shp, arcs);
    return p ? [[p.x, p.y]] : null;
  });
};

MapShaper.pointsFromDataTable = function(data, opts) {
  if (!data) stop("[points] layer is missing a data table");
  if (!opts.x || !opts.y || !data.fieldExists(opts.x) || !data.fieldExists(opts.y)) {
    stop("[points] missing x,y data fields");
  }

  return data.getRecords().map(function(rec) {
    var x = rec[opts.x],
        y = rec[opts.y];
    if (!utils.isFiniteNumber(x) || !utils.isFiniteNumber(y)) {
      nulls++;
      return null;
    }
    return [[x, y]];
  });
};
