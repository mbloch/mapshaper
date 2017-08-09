/* @require mapshaper-dataset-utils */

internal.transformDatasetToPixels = function(dataset, opts) {
  var width = opts.width > 0 ? opts.width : 800,
      margin = opts.margin >= 0 ? opts.margin : 1, // default 1px margin
      bounds = internal.getDatasetBounds(dataset),
      height, bounds2, fwd;

  if (opts.svg_scale > 0) {
    // alternative to using a fixed width (e.g. when generating multiple files
    // at a consistent geographic scale)
    width = bounds.width() / opts.svg_scale;
    margin = 0;
  }
  internal.applyMarginInPixels(bounds, width, margin);
  height = Math.ceil(width * bounds.height() / bounds.width());
  bounds2 = new Bounds(0, 0, width, height);
  fwd = bounds.getTransform(bounds2, opts.invert_y);
  internal.transformPoints(dataset, function(x, y) {
    return fwd.transform(x, y);
  });
  return bounds2;
};


// Pad geographic bounds prior to conversion to pixels
internal.applyMarginInPixels = function(bounds, width, marginPx) {
  var bw = bounds.width() || bounds.height() || 1; // handle 0 width bbox
  var marg;
  if (marginPx >= 0 === false) {
    marginPx = 1;
  }
  marg = bw / (width - marginPx * 2) * marginPx;
  bounds.padBounds(marg, marg, marg, marg);
};

