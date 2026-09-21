import { Bounds } from '../geom/mapshaper-bounds';
import { getDatasetCRS, getScaleFactorAtXY} from '../crs/mapshaper-projections';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { getFurnitureLayerData } from '../furniture/mapshaper-furniture-utils';
import { error, stop, warn } from '../utils/mapshaper-logging';
import { layerIsRectangle, getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { transformPoints } from '../dataset/mapshaper-dataset-utils';
import { parseSizeParam } from '../geom/mapshaper-units';
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
  var frameTarget = resolveExportFrame({targetDataset: dataset, mode: 'cli'});
  var frameLyr = frameTarget && frameTarget.layer;
  var data;
  if (exportOpts.gui_frame?.data) {
    data = Object.assign({}, exportOpts.gui_frame.data, {
      bbox: exportOpts.gui_frame.data.bbox.slice()
    });
    if (exportOpts.width > 0 || exportOpts.height > 0) {
      data = resizeFrameForExport(data, exportOpts);
    }
  } else if (frameLyr) {
    data = getFrameLayerData(frameLyr, dataset.arcs, getDatasetCRS(dataset));
    if (exportOpts.width > 0 || exportOpts.height > 0) {
      data = resizeFrameForExport(data, exportOpts);
    }
  } else {
    data = calcFrameData(dataset, exportOpts);
  }
  data.invert_y = !!exportOpts.invert_y;
  data.crs = getDatasetCRS(dataset);
  return data;
}

function resizeFrameForExport(frame, opts) {
  var bounds = new Bounds(frame.bbox);
  // A stored frame is an exact geographic crop. The SVG exporter's default
  // 1px content margin applies only to frameless output.
  var outputOpts = Object.assign({}, opts, {margin: 0});
  var outputBounds = calcOutputBounds(bounds, outputOpts);
  var data = {
    type: 'frame',
    bbox: bounds.toArray(),
    bbox2: outputBounds.toArray(),
    width: Math.round(outputBounds.width()),
    height: Math.round(outputBounds.height()) || 1,
    // The authored unit still describes this frame, but an explicit output size
    // supersedes any fixed page shape, so the aspect is no longer pinned.
    aspect_ratio: null,
    units: frame.units || 'px'
  };
  if (data.width != frame.width || data.height != frame.height) {
    warn(
      `Output size ${data.width}×${data.height}px overrides the map frame's ` +
      `nominal size ${frame.width}×${frame.height}px; symbol and label sizes are not rescaled.`
    );
  }
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

export function getFrameLayerData(lyr, arcs, crs) {
  if (!isFrameLayer(lyr, arcs)) {
    error('Invalid map frame layer');
  }
  var bounds = getLayerBounds(lyr, arcs);
  var d = getSingleFrameRecord(lyr);
  var w = d.width;
  var hasFixedAspect = utils.isFiniteNumber(d.frame_aspect_ratio) &&
    d.frame_aspect_ratio > 0;
  var aspectRatio = hasFixedAspect ? d.frame_aspect_ratio :
    bounds.width() / bounds.height();
  // prevent rounding errors (like 1000.0000000002)
  var h = Math.round(w / aspectRatio);
  var data = {
    type: 'frame',
    width: w,
    height: h,
    bbox: bounds.toArray(),
    aspect_ratio: hasFixedAspect ? d.frame_aspect_ratio : null,
    units: d.frame_units || 'px'
  };
  if (crs) data.crs = crs;
  return data;
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


export var frameReservedFields =
  ['type', 'width', 'height', 'frame_aspect_ratio', 'frame_units'];

export function parseFrameSize(arg) {
  var str = String(arg).toLowerCase();
  var units = /px|pix/.test(str) && 'px' ||
    /pt|point/.test(str) && 'pt' ||
    /in/.test(str) && 'in' ||
    /cm/.test(str) && 'cm' ||
    'px';
  return {valuePx: parseSizeParam(arg), units: units};
}

export function formatFrameSizeForDisplay(frame) {
  var units = frame.units || 'px';
  var k = units == 'in' ? 72 :
    units == 'cm' ? 28.3465 : 1;
  return formatFrameDimension(frame.width / k) + ' × ' +
    formatFrameDimension(frame.height / k) + ' ' + units;
}

function formatFrameDimension(value) {
  var rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function isFrameReservedField(name) {
  return frameReservedFields.includes(name);
}

export function demoteFrameLayer(lyr, operation) {
  var rec = lyr.data && lyr.data.getRecords()[0];
  if (!rec) return;
  operation = operation || 'frame';
  lyr.data.captureTableBefore({operation: operation});
  frameReservedFields.forEach(function(field) {
    delete rec[field];
  });
  lyr.data.markChanged({operation: operation});
}

export function getSingleFrameRecord(lyr) {
  if (!lyr || !lyr.data || !lyr.shapes ||
      lyr.shapes.length != 1 || lyr.data.size() != 1) {
    return null;
  }
  return lyr.data.getReadOnlyRecordAt(0) || null;
}

// @lyr dataset layer
export function isFrameLayer(lyr, arcs) {
  var rec = getSingleFrameRecord(lyr);
  return !!rec &&
    lyr.geometry_type == 'polygon' &&
    rec.type == 'frame' &&
    utils.isFiniteNumber(rec.width) &&
    rec.width > 0 &&
    layerIsRectangle(lyr, arcs);
}

export function findFrameLayerInDataset(dataset) {
  return utils.find(dataset.layers, function(lyr) {
    return isFrameLayer(lyr, dataset.arcs);
  });
}

export function findFrames(catalog) {
  return catalog.getLayers().filter(function(o) {
    return isFrameLayer(o.layer, o.dataset.arcs);
  });
}

// Remembers the frame conflict that was last reported, so that resolving the
// frame on every map render does not repeat the same warning. Unlike
// warnOnce(), this resets when the conflict clears, so a long-lived GUI session
// warns again if the user undoes the change and then repeats it.
var reportedFrameConflict = null;

// Generic field commands can promote an ordinary rectangle into a second frame
// (e.g. -each 'type="frame", width=400'), and the GUI resolves the frame on
// every render, so this has to degrade to a deterministic choice rather than an
// error. Rejecting the change outright is assertSingleFrameUpdate()'s job,
// where it can still be refused before it is committed.
export function getActiveFrame(catalog) {
  var frames = findFrames(catalog);
  var key;
  if (frames.length > 1) {
    key = frames.map(getFrameName).join(', ');
    if (key !== reportedFrameConflict) {
      reportedFrameConflict = key;
      warn('Multiple map frames are not supported; using',
        getFrameName(frames[0]) + '. Ignoring:',
        frames.slice(1).map(getFrameName).join(', '));
    }
  } else {
    reportedFrameConflict = null;
  }
  return frames[0] || null;
}

export function findFrameDataset(catalog) {
  var target = getActiveFrame(catalog);
  return target && target.dataset || null;
}

export function findFrameLayer(catalog) {
  var target = getActiveFrame(catalog);
  return target && target.layer || null;
}

export function findFrame(catalog) {
  return getActiveFrame(catalog);
}

export function resolveExportFrame(opts) {
  if (opts.explicitFrame) return opts.explicitFrame;
  if (opts.targetDataset) {
    var lyr = findFrameLayerInDataset(opts.targetDataset);
    return lyr ? {layer: lyr, dataset: opts.targetDataset} : null;
  }
  return opts.mode == 'gui' && opts.catalog ? getActiveFrame(opts.catalog) : null;
}

export function assertSingleFrameUpdate(catalog, additions, removals) {
  var removed = removals || [];
  var frames = catalog.getLayers().filter(function(o) {
    return !removed.includes(o.layer) && isFrameLayer(o.layer, o.dataset.arcs);
  });
  (additions || []).forEach(function(o) {
    if (!removed.includes(o.layer) && isFrameLayer(o.layer, o.dataset.arcs)) {
      frames.push(o);
    }
  });
  frames = frames.filter(function(o, i) {
    return frames.findIndex(function(o2) {
      return o2.layer == o.layer;
    }) == i;
  });
  if (frames.length > 1) {
    stop('Multiple map frames are not supported:', frames.map(getFrameName).join(', '));
  }
}

export function assertCatalogCanAddDatasets(catalog, datasets, removals) {
  var existingDatasets = catalog.getDatasets();
  var additions = [];
  datasets.forEach(function(dataset) {
    if (existingDatasets.includes(dataset)) return;
    dataset.layers.forEach(function(lyr) {
      additions.push({layer: lyr, dataset: dataset});
    });
  });
  assertSingleFrameUpdate(catalog, additions, removals);
}

function getFrameName(o) {
  return o.layer.name || '[unnamed frame]';
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
