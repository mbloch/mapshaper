/* @require mapshaper-dataset-utils */

internal.transformDatasetToPixels = function(dataset, opts) {
  var margin = opts.margin >= 0 ? opts.margin : 1, // default 1px margin
      bounds = internal.getDatasetBounds(dataset),
      width, height, bounds2, fwd;

  if (opts.svg_scale > 0) {
    // alternative to using a fixed width (e.g. when generating multiple files
    // at a consistent geographic scale)
    width = bounds.width() / opts.svg_scale + margin * 2;
  } else {
    width = opts.width > 0 ? opts.width : 800;
  }
  internal.applyMarginInPixels(bounds, width, margin);
  height = width * bounds.height() / bounds.width();
  bounds2 = new Bounds(0, 0, width, height);
  fwd = bounds.getTransform(bounds2, opts.invert_y);
  internal.transformPoints(dataset, function(x, y) {
    return fwd.transform(x, y);
  });
  return [width, Math.round(height) || 1];
};


// Pad geographic bounds prior to conversion to pixels
internal.applyMarginInPixels = function(bounds, widthPx, marginPx) {
  var widthGeo = bounds.width() || bounds.height() || 1; // avoid 0 width bbox
  var pad = widthGeo * marginPx / (widthPx - marginPx * 2);
  bounds.padBounds(pad, pad, pad, pad);
};

