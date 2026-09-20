import cmd from '../mapshaper-cmd';
import { Bounds } from '../geom/mapshaper-bounds';
import {
  demoteFrameLayer,
  getFrameLayerData,
  isFrameLayer,
  parseFrameSize
} from '../furniture/mapshaper-frame-utils';
import { rebuildFrameLayerGeometry } from '../furniture/mapshaper-frame-projection';
import {
  applyPercentageOffsets,
  applyPixelOffsets,
  fillOutBbox
} from './mapshaper-frame';
import { stop } from '../utils/mapshaper-logging';
import { noteLayerWillChange, markLayerChanged } from '../undo/mapshaper-undo-tracking';
import utils from '../utils/mapshaper-utils';

var OPERATION = 'update-frame';

export function updateFrame(targetLayers, dataset, opts) {
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

  var rec = lyr.data.getRecords()[0];
  var frame = getFrameLayerData(lyr, dataset.arcs);
  var bbox = (opts.bbox || frame.bbox).slice();
  var offsetArg = opts.offset || opts.offsets;
  var fixedAspect = getFixedAspect(rec);
  var width = frame.width;
  var units = rec.frame_units || 'px';
  var widthSize, heightSize, height, effectiveAspect;

  // 1. Extent
  if (offsetArg) {
    applyPercentageOffsets(bbox, offsetArg);
    applyPixelOffsets(bbox, frame.width, frame.height, offsetArg);
  }
  requireValidBbox(bbox);

  // 2. Aspect mode
  if (opts.auto_aspect) {
    fixedAspect = null;
  } else if (opts.aspect_ratio !== undefined) {
    if (!utils.isFiniteNumber(opts.aspect_ratio) || opts.aspect_ratio <= 0) {
      stop('Invalid aspect-ratio parameter:', opts.aspect_ratio);
    }
    fixedAspect = opts.aspect_ratio;
  }
  if (fixedAspect) {
    fillOutBbox(bbox, fixedAspect, 1);
  }

  // 3. Nominal size
  if (opts.width !== undefined) {
    widthSize = parseFrameSize(opts.width);
    requirePositiveSize(widthSize.valuePx, 'width', opts.width);
  }
  if (opts.height !== undefined) {
    heightSize = parseFrameSize(opts.height);
    requirePositiveSize(heightSize.valuePx, 'height', opts.height);
  }
  if (widthSize && heightSize) {
    effectiveAspect = widthSize.valuePx / heightSize.valuePx;
    if (opts.aspect_ratio !== undefined &&
        ratiosDiffer(effectiveAspect, opts.aspect_ratio)) {
      stop('Contradictory width, height and aspect-ratio values');
    }
    width = widthSize.valuePx;
    units = widthSize.units;
    fixedAspect = effectiveAspect;
    fillOutBbox(bbox, fixedAspect, 1);
  } else if (widthSize) {
    width = widthSize.valuePx;
    units = widthSize.units;
  } else if (heightSize) {
    effectiveAspect = fixedAspect || getBboxAspect(bbox);
    width = heightSize.valuePx * effectiveAspect;
    units = heightSize.units;
  }

  requireValidBbox(bbox);
  effectiveAspect = fixedAspect || getBboxAspect(bbox);
  height = Math.round(width / effectiveAspect);

  noteLayerWillChange(lyr, {operation: OPERATION, unit: 'shapes'});
  noteLayerWillChange(lyr, {operation: OPERATION, unit: 'data'});
  rec.width = width;
  rec.height = height;
  rec.frame_units = units;
  if (fixedAspect) {
    rec.frame_aspect_ratio = fixedAspect;
  } else {
    delete rec.frame_aspect_ratio;
  }
  markLayerChanged(lyr, {operation: OPERATION, unit: 'data'});
  rebuildFrameLayerGeometry(lyr, dataset, new Bounds(bbox));
  markLayerChanged(lyr, {operation: OPERATION, unit: 'shapes'});
}

function hasUpdateOptions(opts) {
  return opts.bbox !== undefined ||
    opts.width !== undefined ||
    opts.height !== undefined ||
    opts.aspect_ratio !== undefined ||
    opts.auto_aspect ||
    opts.offset !== undefined ||
    opts.offsets !== undefined;
}

function getFixedAspect(rec) {
  return utils.isFiniteNumber(rec.frame_aspect_ratio) &&
    rec.frame_aspect_ratio > 0 ? rec.frame_aspect_ratio : null;
}

function getBboxAspect(bbox) {
  return (bbox[2] - bbox[0]) / (bbox[3] - bbox[1]);
}

function requireValidBbox(bbox) {
  if (!bbox.every(utils.isFiniteNumber) ||
      bbox[2] - bbox[0] <= 0 ||
      bbox[3] - bbox[1] <= 0) {
    stop('Frame has a collapsed bbox');
  }
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
