/* @requires mapshaper-data-table, mapshaper-dataset-utils */

api.createPointLayer = function(srcLyr, opts) {
  var data = srcLyr.data,
      nulls = 0,
      destLyr;

  if (!data) stop("[points] layer is missing a data table");
  if (!opts.x || !opts.y || !data.fieldExists(opts.x) || !data.fieldExists(opts.y)) {
    stop("[points] missing x,y data fields");
  }

  destLyr = {
    geometry_type: 'point',
    data: opts.no_replace ? data.clone() : data
  };
  destLyr.shapes = data.getRecords().map(function(rec) {
    var x = rec[opts.x],
        y = rec[opts.y];
    if (!utils.isFiniteNumber(x) || !utils.isFiniteNumber(y)) {
      nulls++;
      return null;
    }
    return [[x, y]];
  });

  if (nulls > 0) {
    message(utils.format('[points] %d/%d points are null', nulls, data.size()));
  }

  return destLyr;
};
