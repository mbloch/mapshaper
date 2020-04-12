import { getFrameSize } from '../commands/mapshaper-frame';
import { transformPoints, getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { getFurnitureLayerData } from '../furniture/mapshaper-furniture';
import { findFrameLayerInDataset } from '../commands/mapshaper-frame';
import { Bounds } from '../geom/mapshaper-bounds';
import utils from '../utils/mapshaper-utils';
import { error } from '../utils/mapshaper-logging';

export function transformDatasetToPixels(dataset, opts) {
  var frameLyr = findFrameLayerInDataset(dataset);
  var bounds, bounds2, fwd, frameData;
  if (frameLyr) {
    // TODO: handle options like width, height margin when a frame is present
    // TODO: check that aspect ratios match
    frameData = getFurnitureLayerData(frameLyr);
    bounds = new Bounds(frameData.bbox);
    bounds2 = new Bounds(0, 0, frameData.width, frameData.height);
  } else {
    bounds = getDatasetBounds(dataset);
    bounds2 = calcOutputSizeInPixels(bounds, opts);
  }
  fwd = bounds.getTransform(bounds2, opts.invert_y);
  transformPoints(dataset, function(x, y) {
    return fwd.transform(x, y);
  });
  return [Math.round(bounds2.width()), Math.round(bounds2.height()) || 1];
}

export function parseMarginOption(opt) {
  var str = utils.isNumber(opt) ? String(opt) : opt || '';
  var margins = str.trim().split(/[, ] */);
  if (margins.length == 1) margins.push(margins[0]);
  if (margins.length == 2) margins.push(margins[0], margins[1]);
  if (margins.length == 3) margins.push(margins[2]);
  return margins.map(function(str) {
    var px = parseFloat(str);
    return isNaN(px) ? 1 : px; // 1 is default
  });
}

// bounds: Bounds object containing bounds of content in geographic coordinates
// returns Bounds object containing bounds of pixel output
// side effect: bounds param is modified to match the output frame
export function calcOutputSizeInPixels(bounds, opts) {
  var padX = 0,
      padY = 0,
      width = bounds.width(),
      height = bounds.height(),
      margins = parseMarginOption(opts.margin),
      marginX = margins[0] + margins[2],
      marginY = margins[1] + margins[3],
      // TODO: add option to tweak alignment of content when both width and height are given
      wx = 0.5, // how padding is distributed horizontally (0: left aligned, 0.5: centered, 1: right aligned)
      wy = 0.5, // vertical padding distribution
      widthPx, heightPx, size, kx, ky;

  if (opts.svg_scale > 0) {
    // alternative to using a fixed width (e.g. when generating multiple files
    // at a consistent geographic scale)
    widthPx = width / opts.svg_scale + marginX;
    heightPx = 0;
  } else if (+opts.pixels) {
    size = getFrameSize(bounds, opts);
    widthPx = size[0];
    heightPx = size[1];
  } else {
    heightPx = opts.height || 0;
    widthPx = opts.width || (heightPx > 0 ? 0 : 800); // 800 is default width
  }

  if (heightPx > 0) {
    // vertical meters per pixel to fit height param
    ky = (height || width || 1) / (heightPx - marginY);
  }
  if (widthPx > 0) {
    // horizontal meters per pixel to fit width param
    kx = (width || height || 1) / (widthPx - marginX);
  }

  if (!widthPx) { // heightPx and ky are defined, set width to match
    kx = ky;
    widthPx = width > 0 ? marginX + width / kx : heightPx; // export square graphic if content has 0 width (reconsider this?)
  } else if (!heightPx) { // widthPx and kx are set, set height to match
    ky = kx;
    heightPx = height > 0 ? marginY + height / ky : widthPx;
    // limit height if max_height is defined
    if (opts.max_height > 0 && heightPx > opts.max_height) {
      ky = kx * heightPx / opts.max_height;
      heightPx = opts.max_height;
    }
  }

  if (kx > ky) { // content is wide -- need to pad vertically
    ky = kx;
    padY = ky * (heightPx - marginY) - height;
  } else if (ky > kx) { // content is tall -- need to pad horizontally
    kx = ky;
    padX = kx * (widthPx - marginX) - width;
  }

  bounds.padBounds(
    margins[0] * kx + padX * wx,
    margins[1] * ky + padY * wy,
    margins[2] * kx + padX * (1 - wx),
    margins[3] * ky + padY * (1 - wy));

  if (!(widthPx > 0 && heightPx > 0)) {
    error("Missing valid height and width parameters");
  }
  if (!(kx === ky && kx > 0)) {
    error("Missing valid margin parameters");
  }

  return new Bounds(0, 0, widthPx, heightPx);
}
