/* @requires mapshaper-info, mapshaper-expressions */

api.inspect = function(lyr, arcs, opts) {
  var ids = MapShaper.selectFeatures(lyr, arcs, opts);
  var msg;
  if (!lyr.data || lyr.data.getFields().length === 0) {
    msg = "[inspect] Layer is missing attribute data";
  } else if (ids.length == 1) {
    msg = MapShaper.getTableInfo(lyr.data, ids[0]);
  } else {
    msg = utils.format("[inspect] Expression matched %d feature%s. Select one feature to view attribute data", ids.length, utils.pluralSuffix(ids.length));
  }
  message(msg);
};

MapShaper.selectFeatures = function(lyr, arcs, opts) {
  var n = MapShaper.getFeatureCount(lyr),
      ids = [],
      filter;
  if (!opts.expression) {
    stop("[inspect] Missing a JS expression for selecting feature(s)");
  }
  filter = MapShaper.compileValueExpression(opts.expression, lyr, arcs);
  utils.repeat(n, function(id) {
    var result = filter(id);
    if (result === true) {
      ids.push(id);
    } else if (result !== false) {
      stop("[inspect] Expression must return true or false");
    }
  });
  return ids;
};
