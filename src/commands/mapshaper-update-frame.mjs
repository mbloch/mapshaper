import cmd from '../mapshaper-cmd';
import { Bounds } from '../geom/mapshaper-bounds';
import {
  demoteFrameLayer,
  getFrameLayerData,
  isFrameLayer,
  parseFrameSize
} from '../furniture/mapshaper-frame-utils';
import { rebuildFrameLayerGeometry } from '../furniture/mapshaper-frame-projection';
import { getFrameContentBbox, getFrameScale } from '../furniture/mapshaper-frame-fit';
import { requireDatasetsHaveCompatibleCRS } from '../crs/mapshaper-projections';
import {
  applyPercentageOffsets,
  applyPixelOffsets,
  fillOutBbox
} from './mapshaper-frame';
import { stop } from '../utils/mapshaper-logging';
import { noteLayerWillChange, markLayerChanged } from '../undo/mapshaper-undo-tracking';
import utils from '../utils/mapshaper-utils';

var OPERATION = 'update-frame';

// @fitTargets: [{layer, dataset}] named by the fit= option
export function updateFrame(targetLayers, dataset, opts, fitTargets) {
  if (!targetLayers || targetLayers.length != 1) {
    stop('-update-frame expects a single target layer');
  }
  var lyr = targetLayers[0];
  if (!isFrameLayer(lyr, dataset.arcs)) {
    stop('Target layer is not a map frame:', lyr.name || '[unnamed layer]');
  }
  if (opts.remove) {
    if (hasUpdateOptions(opts)) {
      stop('The remove option cannot be combined with frame update options');
    }
    demoteFrameLayer(lyr, OPERATION);
    return;
  }
  if (!hasUpdateOptions(opts)) {
    stop('Missing frame update option(s)');
  }
  if (opts.aspect_ratio !== undefined && opts.auto_aspect) {
    stop('aspect-ratio= and auto-aspect are mutually exclusive');
  }
  if (opts.fix_scale && (opts.width !== undefined || opts.height !== undefined)) {
    stop('fix-scale cannot be combined with width= or height=');
  }
  if (opts.bbox !== undefined && opts.fit !== undefined) {
    stop('bbox= and fit= are mutually exclusive');
  }

  var rec = lyr.data.getRecords()[0];
  var frame = getFrameLayerData(lyr, dataset.arcs);
  var fixedAspect = getFixedAspect(rec);
  var sizes, contentBbox, update;

  // 1. Aspect mode, resolved first because whether the page shape is fixed
  // decides whether it may constrain the extent while offsets are applied.
  if (opts.auto_aspect) {
    fixedAspect = null;
  } else if (opts.aspect_ratio !== undefined) {
    if (!utils.isFiniteNumber(opts.aspect_ratio) || opts.aspect_ratio <= 0) {
      stop('Invalid aspect-ratio parameter:', opts.aspect_ratio);
    }
    fixedAspect = opts.aspect_ratio;
  }
  sizes = parseSizeOptions(opts);

  // 2. Extent, which fit= finds by trying extents out on steps 3 and 4
  if (opts.fit !== undefined) {
    contentBbox = getFrameContentBbox(getFitTargets(fitTargets, dataset), function(bbox) {
      var o = resolveFrameUpdate(bbox, frame, fixedAspect, sizes, opts);
      return getFrameScale(o.bbox, o.width, o.fixedAspect);
    }, opts);
    if (!contentBbox) {
      stop('Layers to fit are missing geographical bounds');
    }
  } else {
    contentBbox = opts.bbox || frame.bbox;
  }

  update = resolveFrameUpdate(contentBbox, frame, fixedAspect, sizes, opts);
  if (!update.valid) {
    stop('Frame has a collapsed bbox');
  }
  if (opts.fix_scale) {
    requirePositiveSize(update.width, 'fix-scale', update.width);
  }

  noteLayerWillChange(lyr, {operation: OPERATION, unit: 'shapes'});
  lyr.data.captureTableBefore({operation: OPERATION});
  rec.width = update.width;
  rec.height = update.height;
  rec.frame_units = update.units;
  if (update.fixedAspect) {
    rec.frame_aspect_ratio = update.fixedAspect;
  } else {
    delete rec.frame_aspect_ratio;
  }
  lyr.data.markChanged({operation: OPERATION});
  rebuildFrameLayerGeometry(lyr, dataset, new Bounds(update.bbox));
  markLayerChanged(lyr, {operation: OPERATION, unit: 'shapes'});
}

// The frame's layers are not content to fit, and a frame is only fitted to
// layers it shares coordinates with.
function getFitTargets(fitTargets, frameDataset) {
  var targets = (fitTargets || []).filter(function(o) {
    return !isFrameLayer(o.layer, o.dataset.arcs);
  });
  if (targets.length === 0) {
    stop('fit= found no layers to fit the frame to');
  }
  requireDatasetsHaveCompatibleCRS(
    utils.uniq(targets.map(function(o) { return o.dataset; }).concat(frameDataset)),
    'Layers to fit and the frame have incompatible coordinates'
  );
  return targets;
}

function parseSizeOptions(opts) {
  var sizes = {width: null, height: null};
  if (opts.width !== undefined) {
    sizes.width = parseFrameSize(opts.width);
    requirePositiveSize(sizes.width.valuePx, 'width', opts.width);
  }
  if (opts.height !== undefined) {
    sizes.height = parseFrameSize(opts.height);
    requirePositiveSize(sizes.height.valuePx, 'height', opts.height);
  }
  if (sizes.width && sizes.height && opts.aspect_ratio !== undefined &&
      ratiosDiffer(sizes.width.valuePx / sizes.height.valuePx, opts.aspect_ratio)) {
    stop('Contradictory width, height and aspect-ratio values');
  }
  return sizes;
}

// Steps 3 and 4 as a pure function of the content extent, so that fit= can
// ask what scale an extent would give the frame.
function resolveFrameUpdate(contentBbox, frame, fixedAspect, sizes, opts) {
  var bbox = contentBbox.slice();
  var offsetArg = opts.offset || opts.offsets;
  var width = frame.width;
  var units = frame.units || 'px';
  var valid, effectiveAspect;

  // 3. Padding
  if (offsetArg) {
    applyPercentageOffsets(bbox, offsetArg);
    // Pass a page height only when the shape is fixed. A derived height
    // follows the extent, so letting it pad the bbox here would hold a
    // re-fitted frame to its old shape instead of its new bounds.
    applyPixelOffsets(bbox, frame.width,
      fixedAspect ? frame.width / fixedAspect : null, offsetArg);
  }
  valid = isValidBbox(bbox);
  if (fixedAspect) {
    fillOutBbox(bbox, fixedAspect, 1);
  }

  // 4. Nominal size
  if (sizes.width && sizes.height) {
    width = sizes.width.valuePx;
    units = sizes.width.units;
    fixedAspect = sizes.width.valuePx / sizes.height.valuePx;
    fillOutBbox(bbox, fixedAspect, 1);
  } else if (sizes.width) {
    width = sizes.width.valuePx;
    units = sizes.width.units;
  } else if (sizes.height) {
    effectiveAspect = fixedAspect || getBboxAspect(bbox);
    width = sizes.height.valuePx * effectiveAspect;
    units = sizes.height.units;
  } else if (opts.fix_scale) {
    // Hold ground units per output pixel, so the page grows and shrinks with
    // the extent instead of the scale changing to fit the extent on it.
    width = frame.width * getBboxWidth(bbox) / getBboxWidth(frame.bbox);
  }

  effectiveAspect = fixedAspect || getBboxAspect(bbox);
  return {
    bbox: bbox,
    width: width,
    height: Math.round(width / effectiveAspect),
    units: units,
    fixedAspect: fixedAspect,
    valid: valid && isValidBbox(bbox)
  };
}

function hasUpdateOptions(opts) {
  return opts.bbox !== undefined ||
    opts.fit !== undefined ||
    opts.width !== undefined ||
    opts.height !== undefined ||
    opts.aspect_ratio !== undefined ||
    opts.auto_aspect ||
    opts.fix_scale ||
    opts.offset !== undefined ||
    opts.offsets !== undefined;
}

function getBboxWidth(bbox) {
  return bbox[2] - bbox[0];
}

function getFixedAspect(rec) {
  return utils.isFiniteNumber(rec.frame_aspect_ratio) &&
    rec.frame_aspect_ratio > 0 ? rec.frame_aspect_ratio : null;
}

function getBboxAspect(bbox) {
  return (bbox[2] - bbox[0]) / (bbox[3] - bbox[1]);
}

function isValidBbox(bbox) {
  return bbox.every(utils.isFiniteNumber) &&
    bbox[2] - bbox[0] > 0 &&
    bbox[3] - bbox[1] > 0;
}

function requirePositiveSize(value, name, arg) {
  if (!utils.isFiniteNumber(value) || value <= 0) {
    stop('Invalid ' + name + ' parameter:', arg);
  }
}

function ratiosDiffer(a, b) {
  return Math.abs(a - b) > 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
}

cmd.updateFrame = updateFrame;
