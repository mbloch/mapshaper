import { Bounds } from '../geom/mapshaper-bounds';
import { getDatasetCRS, getScaleFactorAtXY} from '../crs/mapshaper-projections';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { getFurnitureLayerType } from '../furniture/mapshaper-furniture';
import utils from '../utils/mapshaper-utils';
import { error } from '../utils/mapshaper-logging';
/*
{
  width: size[0],
  height: size[1],
  bbox: bounds.toArray(),
  type: 'frame'
}
*/
export function getFrameData(dataset, exportOpts) {
  var frameLyr = findFrameLayerInDataset(dataset);
  var frameData;
  if (frameLyr) {
    frameData = Object.assign({}, getFrameLayerData(frameLyr));
  } else {
    frameData = calcFrameData(dataset, exportOpts);
  }
  frameData.crs = getDatasetCRS(dataset);
  return frameData;
}

function calcFrameData(dataset, opts) {
  var bounds;
  if (opts.svg_bbox) {
    bounds = new Bounds(opts.svg_bbox);
    opts = Object.assign({margin: 0}, opts); // prevent default pixel margin around content
  } else {
    bounds = getDatasetBounds(dataset);
  }
  var pixBounds = calcOutputSizeInPixels(bounds, opts);
  return {
    bbox: bounds.toArray(),
    width: Math.round(pixBounds.width()),
    height: Math.round(pixBounds.height()) || 1,
    type: 'frame'
  };
}

export function getFrameLayerData(lyr) {
  return lyr.data && lyr.data.getReadOnlyRecordAt(0);
}

// Used by mapshaper-frame and mapshaper-pixel-transform. TODO: refactor
export function getFrameSize(bounds, opts) {
  var aspectRatio = bounds.width() / bounds.height();
  var height, width;
  if (opts.pixels) {
    width = Math.sqrt(+opts.pixels * aspectRatio);
  } else {
    width = +opts.width;
  }
  height = width / aspectRatio;
  return [Math.round(width), Math.round(height)];
}


// @lyr dataset layer
function isFrameLayer(lyr) {
  return getFurnitureLayerType(lyr) == 'frame';
}

export function findFrameLayerInDataset(dataset) {
  return utils.find(dataset.layers, function(lyr) {
    return isFrameLayer(lyr);
  });
}

export function findFrameDataset(catalog) {
  var target = utils.find(catalog.getLayers(), function(o) {
    return isFrameLayer(o.layer);
  });
  return target ? target.dataset : null;
}

export function findFrameLayer(catalog) {
  var target = utils.find(catalog.getLayers(), function(o) {
    return isFrameLayer(o.layer);
  });
  return target && target.layer || null;
}

export function getFrameLayerBounds(lyr) {
  return new Bounds(getFrameLayerData(lyr).bbox);
}

// @data frame data, including crs property if available
// Returns a single value: the ratio or
export function getMapFrameMetersPerPixel(data) {
  var bounds = new Bounds(data.bbox);
  var k, toMeters, metersPerPixel;
  if (data.crs) {
    // TODO: handle CRS without inverse projections
    // scale factor is the ratio of coordinate distance to true distance at a point
    k = getScaleFactorAtXY(bounds.centerX(), bounds.centerY(), data.crs);
    toMeters = data.crs.to_meter;
  } else {
    // Assuming coordinates are meters and k is 1 (not safe)
    // A warning should be displayed when relevant furniture element is created
    k = 1;
    toMeters = 1;
  }
  metersPerPixel = bounds.width() / k * toMeters / data.width;
  return metersPerPixel;
}


// bounds: Bounds object containing bounds of content in geographic coordinates
// returns Bounds object containing bounds of pixel output
// side effect: bounds param is modified to match the output frame
export function calcOutputSizeInPixels(bounds, opts) {
  var padX = 0,
      padY = 0,
      offX = 0,
      offY = 0,
      width = bounds.width(),
      height = bounds.height(),
      margins = parseMarginOption(opts.margin),
      marginX = margins[0] + margins[2],
      marginY = margins[1] + margins[3],
      // TODO: add option to tweak alignment of content when both width and height are given
      wx = 0.5, // how padding is distributed horizontally (0: left aligned, 0.5: centered, 1: right aligned)
      wy = 0.5, // vertical padding distribution
      widthPx, heightPx, size, kx, ky;

  if (opts.fit_bbox) {
    // scale + shift content to fit within a bbox
    offX = opts.fit_bbox[0];
    offY = opts.fit_bbox[1];
    widthPx = opts.fit_bbox[2] - offX;
    heightPx = opts.fit_bbox[3] - offY;
    if (width / height > widthPx / heightPx) {
      // data is wider than fit box...
      // scale the data to fit widthwise
      heightPx = 0;
    } else {
      widthPx = 0; // fit the data to the height
    }
    marginX = marginY = 0; // TODO: support margins

  } else if (opts.svg_scale > 0) {
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

  return new Bounds(offX, offY, widthPx + offX, heightPx + offY);
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
