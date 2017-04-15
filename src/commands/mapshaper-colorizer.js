/* @requires mapshaper-common, mapshaper-rounding */

api.colorizer = function(opts) {
  var _nodata = opts.nodata || '#eee';
  var _breaks = opts.breaks || [];
  var _colors = opts.colors || [];
  var round = opts.precision ? utils.getRoundingFunction(opts.precision) : null;

  if (!opts.name) {
    stop("Missing required name= parameter.");
  }

  MapShaper.defs[opts.name] = function(val) {
    var i = -1;
    if (round) val = val(round);
    i = utils.getClassId(val, _breaks);
    return i > -1 && i < _colors.length ? _colors[i] : _nodata;
  };
};

utils.getClassId = function(val, breaks) {
  var id = -1;
  if (!isNaN(val)) {
    id = 0;
    for (var j = 0, len=breaks.length; j < len; j++) {
      var breakVal = breaks[j];
      if (val < breakVal) {
        break;
      }
      id = j + 1;
    }
  }
  return id;
};
