/* @require mapshaper-dataset-utils */

internal.transformDatasetToPixels = function(dataset, opts) {
  var margins = internal.parseMarginOption(opts.margin),
      bounds = internal.getDatasetBounds(dataset),
      width, height, bounds2, fwd;

  if (opts.svg_scale > 0) {
    // alternative to using a fixed width (e.g. when generating multiple files
    // at a consistent geographic scale)
    width = bounds.width() / opts.svg_scale + margins[0] + margins[2];
    height = 0;
  } else {
    height = opts.height || 0;
    width = opts.width || (height > 0 ? 0 : 800); // 800 is default width
  }
  bounds2 = internal.applyMarginInPixels(bounds, width, height, margins);
  fwd = bounds.getTransform(bounds2, opts.invert_y);
  internal.transformPoints(dataset, function(x, y) {
    return fwd.transform(x, y);
  });
  return [Math.round(bounds2.width()), Math.round(bounds2.height()) || 1];
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

// bounds: Bounds object containing bounds of content in geographic coordinates
// returns Bounds object containing bounds of pixel output
// side effect: bounds param is modified to match the output frame
internal.applyMarginInPixels = function(bounds, widthPx, heightPx, margins) {
  var padX = 0,
      padY = 0,
      width = bounds.width(),
      height = bounds.height(),
      marginX = margins[0] + margins[2],
      marginY = margins[1] + margins[3],
      // TODO: add option to tweak alignment of content when both width and height are given
      wx = 0.5, // how padding is distributed horizontally (0: left aligned, 0.5: centered, 1: right aligned)
      wy = 0.5, // vertical padding distribution
      kx, ky, k;
  if (heightPx > 0) {
    // vertical meters per pixel to fit height param
    ky = (height || width || 1) / (heightPx - marginY);
  }
  if (widthPx > 0) {
    // horizontal meters per pixel to fit width param
    kx = (width || height || 1) / (widthPx - marginX);
  }
  if (!kx) { // no widthPx param
    k = ky;
    widthPx = width > 0 ? marginX + width / k : heightPx; // export square graphic if content has 0 width (reconsider this?)
  } else if (!ky) { // no heightPx param
    k = kx;
    heightPx = height > 0 ? marginY + height / k : widthPx;
  } else if (kx > ky) { // content is wide -- need to pad vertically
    k = kx;
    padY = k * (heightPx - marginY) - height;
  } else if (ky > kx) { // content is tall -- need to pad horizontally
    k = ky;
    padX = k * (widthPx - marginX) - width;
  } else {
    error("Missing valid height and width parameters");
  }
  bounds.padBounds(
    margins[0] * k + padX * wx,
    margins[1] * k + padY * wy,
    margins[2] * k + padX * (1 - wx),
    margins[3] * k + padY * (1 - wy));
  return new Bounds(0, 0, widthPx, heightPx);
};
