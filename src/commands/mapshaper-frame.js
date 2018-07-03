/* @require mapshaper-rectangle */

api.frame = function(source, opts) {
  var width = Number(opts.width);
  var height, dataset, bounds;
  if (width > 0 === false) {
    stop("Missing a width");
  }
  if (opts.height) {
    opts = utils.extend({}, opts);
    opts.aspect_ratio = opts.height.split(',').map(function(opt) {
      var height = Number(opt);
      if (!opt) return '';
      if (height > 0 === false) {
        stop('missing a valid height');
      }
      return width / height;
    }).join(',');
  }
  dataset = api.rectangle(source, opts);
  bounds = internal.getDatasetBounds(dataset);
  height = width * bounds.height() / bounds.width();
  dataset.info.frame = {
    bounds: bounds,
    width: width,
    height: height
  };
  if (!opts.name) {
    dataset.layers[0].name = 'frame';
  }
  return dataset;
};
