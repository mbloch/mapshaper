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
  dataset.layers[0].data = new DataTable([{
    width: width,
    height: height,
    type: 'frame'
  }]);
  if (!opts.name) {
    dataset.layers[0].name = 'frame';
  }
  return dataset;
};

internal.layerIsFrame = function(lyr) {
  var rec = lyr.data && lyr.data.size() == 1 && lyr.data.getRecordAt(0) || {};
  return rec.type == 'frame' && rec.width > 0 && rec.height > 0;
};

internal.getFrameData = function(lyr, dataset) {
  var o = null;
  if (internal.layerIsFrame(lyr) && dataset) {
    o = internal.copyRecord(lyr.data.getRecordAt(0));
    o.bounds = internal.getLayerBounds(lyr, dataset.arcs);
  }
  return o;
};
