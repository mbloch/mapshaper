import { Bounds } from '../geom/mapshaper-bounds';
import { getDatasetCRS, getScaleFactorAtXY} from '../crs/mapshaper-projections';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { getFurnitureLayerType, getFurnitureLayerData } from '../furniture/mapshaper-furniture';
import { error } from '../utils/mapshaper-logging';
import { layerIsRectangle, getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { transformPoints } from '../dataset/mapshaper-dataset-utils';
import utils from '../utils/mapshaper-utils';
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
  var data;
  if (frameLyr) {
    data = getFrameLayerData(frameLyr, dataset.arcs);
  } else {
    data = calcFrameData(dataset, exportOpts);
  }
  data.invert_y = !!exportOpts.invert_y;
  data.crs = getDatasetCRS(dataset);
  return data;
}

export function fitDatasetToFrame(dataset, frame) {
  var bounds = new Bounds(frame.bbox);
  var bounds2 = frame.bbox2 ? new Bounds(frame.bbox2) : new Bounds(0, 0, frame.width, frame.height);
  bounds.fillOut(bounds2.width() / bounds2.height());
  var fwd = bounds.getTransform(bounds2, frame.invert_y);
  transformPoints(dataset, function(x, y) {
    return fwd.transform(x, y);
  });
}

export function getFrameLayerData(lyr, arcs) {
  var bounds = getLayerBounds(lyr, arcs);
  var d = lyr.data.getReadOnlyRecordAt(0);
  var w = d.width || 800;
  // prevent rounding errors (like 1000.0000000002)
  var h = Math.round(w * bounds.height() / bounds.width());
  return {
    type: 'frame',
    width: w,
    height: h,
    bbox: bounds.toArray()
  };
}


export function calcFrameData(dataset, opts) {
  var inputBounds, outputBounds;
  if (opts.svg_bbox) {
    inputBounds = new Bounds(opts.svg_bbox);
    opts = Object.assign({margin: 0}, opts); // prevent default pixel margin around content
  } else {
    inputBounds = getDatasetBounds(dataset);
  }
  // side effect: inputBounds may be expanded to add margins
  outputBounds = calcOutputBounds(inputBounds, opts);
  return {
    bbox: inputBounds.toArray(),
    bbox2: outputBounds.toArray(),
    width: Math.round(outputBounds.width()),
    height: Math.round(outputBounds.height()) || 1,
    type: 'frame'
  };
}

// Used by mapshaper-frame  TODO: refactor
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
export function isFrameLayer(lyr, arcs) {
  return getFurnitureLayerType(lyr) == 'frame' &&
    layerIsRectangle(lyr, arcs);
}

export function findFrameLayerInDataset(dataset) {
  return utils.find(dataset.layers, function(lyr) {
    return isFrameLayer(lyr, dataset.arcs);
  });
}

// TODO: handle multiple frames in catalog
export function findFrameDataset(catalog) {
  var target = findFrame(catalog);
  return target && target.dataset || null;
}

export function findFrameLayer(catalog) {
  var target = findFrame(catalog);
  return target && target.layer || null;
}

export function findFrame(catalog) {
  return utils.find(catalog.getLayers(), function(o) {
    return isFrameLayer(o.layer, o.dataset.arcs);
  });
}

export function getFrameLayerBounds(lyr) {
  return new Bounds(getFurnitureLayerData(lyr).bbox);
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
// returns Bounds object containing output bounds
// side effect: bounds param is modified to match the output frame
export function calcOutputBounds(bounds, opts) {
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
      width2, height2, size2, kx, ky;

  if (opts.fit_bbox) {
    // scale + shift content to fit within a bbox
    offX = opts.fit_bbox[0];
    offY = opts.fit_bbox[1];
    width2 = opts.fit_bbox[2] - offX;
    height2 = opts.fit_bbox[3] - offY;
    marginX = marginY = 0; // TODO: support margins

  } else if (opts.svg_scale > 0) {
    // alternative to using a fixed width (e.g. when generating multiple files
    // at a consistent geographic scale)
    width2 = width / opts.svg_scale + marginX;
    height2 = 0;
  } else if (+opts.pixels) {
    size2 = getFrameSize(bounds, opts);
    width2 = size2[0];
    height2 = size2[1];
  } else {
    height2 = opts.height || 0;
    width2 = opts.width || (height2 > 0 ? 0 : 800); // 800 is default width
  }

  if (height2 > 0) {
    // vertical meters per pixel to fit height param
    ky = (height || width || 1) / (height2 - marginY);
  }
  if (width2 > 0) {
    // horizontal meters per pixel to fit width param
    kx = (width || height || 1) / (width2 - marginX);
  }

  if (!width2) { // height2 and ky are defined, set width to match
    kx = ky;
    width2 = width > 0 ? marginX + width / kx : height2; // export square graphic if content has 0 width (reconsider this?)
  } else if (!height2) { // width2 and kx are set, set height to match
    ky = kx;
    height2 = height > 0 ? marginY + height / ky : width2;
    // limit height if max_height is defined
    if (opts.max_height > 0 && height2 > opts.max_height) {
      ky = kx * height2 / opts.max_height;
      height2 = opts.max_height;
    }
  }

  // add padding, if needed
  if (kx > ky) { // content is wide -- need to pad vertically
    ky = kx;
    padY = ky * (height2 - marginY) - height;
  } else if (ky > kx) { // content is tall -- need to pad horizontally
    kx = ky;
    padX = kx * (width2 - marginX) - width;
  }

  bounds.padBounds(
    margins[0] * kx + padX * wx,
    margins[1] * ky + padY * wy,
    margins[2] * kx + padX * (1 - wx),
    margins[3] * ky + padY * (1 - wy));

  if (!(width2 > 0 && height2 > 0)) {
    error("Missing valid height and width parameters");
  }
  if (!(kx === ky && kx > 0)) {
    error("Missing valid margin parameters");
  }

  return new Bounds(offX, offY, width2 + offX, height2 + offY);
}

export function parseMarginOption(opt) {
  var str = utils.isNumber(opt) ? String(opt) : opt || '';
  var margins = str.trim().split(/[, ] */);
  if (margins.length == 1) margins.push(margins[0]);
  if (margins.length == 2) margins.push(margins[0], margins[1]);
  if (margins.length == 3) margins.push(margins[2]);
  return margins.map(function(str) {
    var px = parseFloat(str);
    return isNaN(px) ? 0 : px; // 0 is default
  });
}
