import {
  demoteFrameLayer,
  getActiveFrame,
  getFrameSize,
  parseFrameSize
} from '../furniture/mapshaper-frame-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
import { message, stop } from '../utils/mapshaper-logging';
import { probablyDecimalDegreeBounds } from '../geom/mapshaper-latlon';
import { getDatasetCRS, getDatasetCrsInfo, setDatasetCrsInfo} from '../crs/mapshaper-projections';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { getFrameContentBbox, getFrameScale } from '../furniture/mapshaper-frame-fit';
import { importPolygon } from '../svg/svg-geom-primitives';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { convertFourSides, parseSizeParam } from '../geom/mapshaper-units';
import { bboxToPolygon } from '../commands/mapshaper-rectangle';
import { expandCommandTargets } from '../dataset/mapshaper-target-utils';
import { requireDatasetsHaveCompatibleCRS } from '../crs/mapshaper-projections';
import { importGeoJSON } from '../geojson/geojson-import';
import { layerHasGeometry } from '../dataset/mapshaper-layer-type-utils';
import { roundToDigits } from '../geom/mapshaper-rounding';
import { parsePercent } from '../cli/mapshaper-option-parsing-utils';
import { moveFrameFurniture } from '../furniture/mapshaper-furniture-cmd';

cmd.frame = function(catalog, targets, opts) {
  var widthPx, heightPx, bbox;
  var existingFrame = getActiveFrame(catalog);
  var offsets = parseFrameOffsets(opts);
  if (opts.width) {
    widthPx = parseFrameSize(opts.width).valuePx;
    if (widthPx > 0 === false) {
      stop('Invalid width parameter:', opts.width);
    }
  }
  if (opts.height) {
    heightPx = parseFrameSize(opts.height).valuePx;
    if (heightPx > 0 === false) {
      stop('Invalid height parameter:', opts.height);
    }
  }
  if (!widthPx && !heightPx) {
    widthPx = 800;
    message('Using default 800px frame width');
  }

  if (opts.aspect_ratio) {
    if (opts.aspect_ratio > 0 === false) {
      stop('Invalid aspect-ratio parameter:', opts.aspect_ratio);
    }
    if (!heightPx) {
      heightPx = roundToDigits(widthPx / opts.aspect_ratio, 1);
    } else if (!widthPx) {
      widthPx = roundToDigits(heightPx * opts.aspect_ratio, 1);
    }
  }

  if (opts.bbox) {
    bbox = opts.bbox;
    // TODO: validate
  } else {
    var datasets = utils.pluck(targets, 'dataset');
    requireDatasetsHaveCompatibleCRS(datasets, 'Targets include both projected and unprojected coordinates');
    bbox = getFrameContentBbox(expandCommandTargets(targets), function(contentBbox) {
      var extent = getFrameExtent(contentBbox, widthPx, heightPx, offsets);
      return getFrameScale(extent.bbox, extent.width, getFixedAspect(extent, opts));
    }, opts);
    if (!bbox && !expandCommandTargets(targets).some(function(o) {
      return layerHasGeometry(o.layer);
    })) {
      stop('Unable to fit a frame to a layer with no geometry. Target a layer containing shapes, or use the bbox= option.');
    }
    if (!bbox) {
      stop('Command target is missing geographical bounds');
    }
  }

  var extent = getFrameExtent(bbox, widthPx, heightPx, offsets);
  if (!extent.valid) {
    stop('Frame has a collapsed bbox');
  }

  var feature = {
    type: 'Feature',
    properties: getFrameProperties(extent.width, extent.height, opts),
    geometry: bboxToPolygon(extent.bbox)
  };
  var frameDataset = importGeoJSON(feature);
  // set CRS from target dataset
  // TODO: handle case: targets have different projections
  // TODO: handle case: first target is missing CRS
  if (targets.length > 0) {
    var crsInfo = getDatasetCrsInfo(targets[0].dataset);
    setDatasetCrsInfo(frameDataset, crsInfo);
  }
  var frameLyr = frameDataset.layers[0];
  frameLyr.name = opts.name || 'frame';
  if (existingFrame) {
    if (!opts.replace) {
      stop('A map frame already exists:', existingFrame.layer.name || '[unnamed frame]');
    }
    moveFrameFurniture(existingFrame.dataset, frameDataset);
    demoteFrameLayer(existingFrame.layer);
  }
  // target the frame, not any furniture that came with it
  catalog.setDefaultTarget([frameLyr], frameDataset);
};

// The frame's extent and nominal size, from the extent of its content and the
// size options. Pure, so that fitting to symbols can ask what scale an extent
// would give the frame.
function getFrameExtent(contentBbox, widthPx, heightPx, offsets) {
  var bbox = contentBbox.slice();
  var aspectRatio;
  applyFrameOffsets(bbox, offsets, {width: widthPx, height: heightPx});
  aspectRatio = (bbox[2] - bbox[0]) / (bbox[3] - bbox[1]);
  if (!widthPx) {
    widthPx = roundToDigits(heightPx * aspectRatio, 1);
  } else if (!heightPx) {
    heightPx = roundToDigits(widthPx / aspectRatio, 1);
  }
  return {
    bbox: bbox,
    width: widthPx,
    height: heightPx,
    valid: bbox[3] - bbox[1] > 0 && bbox[2] - bbox[0] > 0
  };
}

function getFixedAspect(extent, opts) {
  return opts.aspect_ratio > 0 || opts.width && opts.height ?
    extent.width / extent.height : null;
}

function getFrameProperties(width, height, opts) {
  var properties = {
    type: 'frame',
    width: width,
    height: height,
    frame_units: opts.width || opts.height ?
      parseFrameSize(opts.width || opts.height).units : 'px'
  };
  if (opts.aspect_ratio > 0 || opts.width && opts.height) {
    properties.frame_aspect_ratio = width / height;
  }
  return properties;
}

export function fillOutBbox(bbox, widthPx, heightPx) {
  var hpad = 0, vpad = 0;
  var w = bbox[2] - bbox[0];
  var h = bbox[3] - bbox[1];
  if (widthPx / heightPx > w / h) { // need to add horizontal padding
    hpad = h * widthPx / heightPx - w;
  } else {
    vpad = w * heightPx / widthPx - h;
  }
  bbox[0] -= hpad / 2;
  bbox[1] -= vpad / 2;
  bbox[2] += hpad / 2;
  bbox[3] += vpad / 2;
}

// Margins from the margin=, offset= or offsets= option, in l,b,r,t order, or
// null if none is given. margin= takes one to four values in CSS order (all
// sides; vertical horizontal; top horizontal bottom; top right bottom left).
// offset= and offsets= are the older form, and take one value or four in
// l,b,r,t order, the order of a bbox. Each side is a length in px plus a share
// of the frame's width: as in CSS, a percentage is of the width on every side,
// so that 5% is an even margin.
export function parseFrameOffsets(opts) {
  var names = ['margin', 'offset', 'offsets'].filter(name => opts[name]);
  var name = names[0];
  var tokens;
  if (names.length > 1) {
    stop(names.map(name => name + '=').join(' and ') + ' are mutually exclusive');
  }
  if (!name) return null;
  tokens = splitOffsetList(opts[name]);
  if (name == 'margin') {
    tokens = expandCssSides(tokens);
  } else if (tokens.length == 1) {
    tokens = [tokens[0], tokens[0], tokens[0], tokens[0]];
  } else if (tokens.length != 4) {
    stop(name + '= expects one value or four, in l,b,r,t order');
  }
  return {
    px: tokens.map(str => str.includes('%') ? 0 : parseSizeParam(str)),
    pct: tokens.map(str => str.includes('%') ? parsePercent(str) : 0)
  };
}

// Accepts comma- or space-separated values, e.g. margin=10%,2% or
// margin='10% 2%'
function splitOffsetList(arg) {
  return [].concat(arg).join(' ').split(/[\s,]+/).filter(Boolean);
}

// CSS shorthand to l,b,r,t
function expandCssSides(arr) {
  var t, r, b, l;
  if (arr.length < 1 || arr.length > 4) {
    stop('margin= expects one to four values, in CSS order (top right bottom left)');
  }
  t = arr[0];
  r = arr.length > 1 ? arr[1] : t;
  b = arr.length > 2 ? arr[2] : t;
  l = arr.length > 3 ? arr[3] : r;
  return [l, b, r, t];
}

// Pads @bbox in place by @offsets (from parseFrameOffsets(), or null for no
// padding). The frame's display width, which percentage margins are a share
// of, is given by @size.width, or follows from @size.height (when the width is
// derived from the padded extent) or from @size.scale (map units per px, when
// the scale is held and the size follows the extent). Given both a width and
// a height, the content is centered on the page and the bbox takes the page's
// shape, so the margins are a minimum on two of the sides.
export function applyFrameOffsets(bbox, offsets, size) {
  var px = offsets ? offsets.px : [0, 0, 0, 0];
  var pct = offsets ? offsets.pct : [0, 0, 0, 0];
  var cw = bbox[2] - bbox[0];
  var ch = bbox[3] - bbox[1];
  var hpct = pct[0] + pct[2],
      vpct = pct[1] + pct[3],
      hpx = px[0] + px[2],
      vpx = px[1] + px[3];
  var widthPx = size.width, heightPx = size.height, scale = size.scale;
  var margins, innerW, innerH, k, hpad = 0, vpad = 0;

  if (hpct >= 1) {
    stop('Left and right offsets add up to 100% or more of the frame width');
  }
  if (widthPx > 0) {
    // all four margins are known in px
  } else if (scale > 0) {
    widthPx = (cw / scale + hpx) / (1 - hpct);
  } else if (heightPx > 0) {
    // heightPx = ch / scale + vpx + vpct * widthPx, where
    // widthPx = (cw / scale + hpx) / (1 - hpct)
    k = vpct / (1 - hpct);
    innerH = heightPx - vpx - k * hpx;
    if (!(innerH > 0)) stopNoRoom();
    scale = (ch + k * cw) / innerH;
    widthPx = (cw / scale + hpx) / (1 - hpct);
  } else {
    stop('Unable to apply offsets to a frame with no display size');
  }
  margins = px.map((n, i) => n + pct[i] * widthPx);

  if (!(scale > 0)) {
    innerW = widthPx - margins[0] - margins[2];
    if (!(innerW > 0)) stopNoRoom();
    if (heightPx > 0) {
      innerH = heightPx - margins[1] - margins[3];
      if (!(innerH > 0)) stopNoRoom();
      scale = Math.max(cw / innerW, ch / innerH);
      hpad = innerW * scale - cw;
      vpad = innerH * scale - ch;
    } else {
      scale = cw / innerW;
    }
  }

  bbox[0] -= scale * margins[0] + hpad / 2;
  bbox[1] -= scale * margins[1] + vpad / 2;
  bbox[2] += scale * margins[2] + hpad / 2;
  bbox[3] += scale * margins[3] + vpad / 2;
}

function stopNoRoom() {
  stop('Frame offsets leave no room for the map');
}

// Convert width and height args to aspect ratio arg for the rectangle() function
export function getAspectRatioArg(widthArg, heightArg) {
  // heightArg is a string containing either a number or a
  // comma-sep. pair of numbers (range);
  return heightArg.split(',').map(function(opt) {
    var height = Number(opt),
        width = Number(widthArg);
    if (!opt) return '';
    return width / height;
  }).reverse().join(',');
}
