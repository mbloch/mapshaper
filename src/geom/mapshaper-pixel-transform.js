/* @require mapshaper-dataset-utils */

internal.transformDatasetToPixels = function(dataset, opts) {
  var margins = internal.parseMarginOption(opts.margin),
      bounds = internal.getDatasetBounds(dataset),
      width, height, bounds2, fwd;

  if (opts.svg_scale > 0) {
    // alternative to using a fixed width (e.g. when generating multiple files
    // at a consistent geographic scale)
    width = bounds.width() / opts.svg_scale + margins[0] + margins[2];
  } else {
    width = opts.width > 0 ? opts.width : 800;
  }
  internal.applyMarginInPixels(bounds, width, margins);
  height = width * bounds.height() / bounds.width();
  bounds2 = new Bounds(0, 0, width, height);
  fwd = bounds.getTransform(bounds2, opts.invert_y);
  internal.transformPoints(dataset, function(x, y) {
    return fwd.transform(x, y);
  });
  return [width, Math.round(height) || 1];
};

internal.parseMarginOption = function(opt) {
  var str = utils.isNumber(opt) ? String(opt) : opt || '';
  var margins = str.trim().split(/[, ] */);
  if (margins.length == 1) margins.push(margins[0]);
  if (margins.length == 2) margins.push(margins[0], margins[1]);
  if (margins.length == 3) margins.push(margins[2]);
  return margins.map(function(str) {
    var px = parseFloat(str);
    return isNaN(px) ? 1 : px; // 1 is default
  });
};

// Pad geographic bounds prior to conversion to pixels
internal.applyMarginInPixels = function(bounds, widthPx, margins) {
  var widthGeo = bounds.width() || bounds.height() || 1; // avoid 0 width bbox
  var k = widthGeo * 1 / (widthPx - margins[0] - margins[2]);
  // var pad = widthGeo * marginPx / (widthPx - marginPx * 2);
  bounds.padBounds(margins[0] * k, margins[1] * k, margins[2] * k, margins[3] * k);
};
