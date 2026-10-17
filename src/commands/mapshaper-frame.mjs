import {
  demoteFrameLayer,
  findFrameLayerInDataset,
  getFrameSize,
  isFrameComponentLayer,
  isFrameLayer,
  parseFrameSize
} from '../furniture/mapshaper-frame-utils';
import {
  getDefaultFrame,
  getFrameByName,
  getFrameForDataset,
  getFrameMemberLayers,
  getFrameMembers,
  getFrames
} from '../furniture/mapshaper-frame-resolver';
import { moveLayersToFrame, requireSameCoordinateSpace } from '../furniture/mapshaper-frame-members';
import { setFrameRef } from '../dataset/mapshaper-frame-membership';
import { getStackedLayers, moveLayersInStack, setFrameHidden } from '../dataset/mapshaper-layer-stacking';
import { createDatasetId } from '../dataset/mapshaper-dataset-ids';
import { copyDataset } from '../dataset/mapshaper-dataset-utils';
import { markLayerMetadataChanged, noteLayerMetadataWillChange } from '../undo/mapshaper-undo-tracking';
import { updateFrame } from './mapshaper-update-frame';
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
import { importGeoJSON } from '../geojson/geojson-import';
import { layerHasGeometry } from '../dataset/mapshaper-layer-type-utils';
import { roundToDigits } from '../geom/mapshaper-rounding';
import { parsePercent } from '../cli/mapshaper-option-parsing-utils';
import { moveFrameFurniture } from '../furniture/mapshaper-furniture-cmd';
import { findOverlayLayer, overlayFrameOnHost, retargetOverlayPlacements,
  setOverlayPlacement } from '../furniture/mapshaper-overlays';

// -frame has two modes, chosen by its target. Given content layers (or no
// layers and bbox=), it creates a frame, and the layers become the frame's
// members. Given one frame, it changes that frame: its members, their order
// and visibility, its page and extent, its name; or it copies or demotes it.
cmd.frame = function(catalog, targets, opts) {
  var items = expandCommandTargets(targets);
  var frames = items.filter(function(o) { return isFrameLayer(o.layer, o.dataset.arcs); });
  if (frames.length > 0 && frames.length < items.length) {
    stop('-frame target= names either layers to frame or one frame to change, not both');
  }
  if (frames.length > 0 && !opts.replace) {
    if (frames.length > 1) {
      stop('-frame changes one frame at a time. Found:', frames.map(getLayerName).join(', '));
    }
    validateModeOptions(opts, CREATE_ONLY_OPTIONS, 'when creating a frame');
    if (!opts.target) {
      message('Changing map frame', getLayerName(frames[0]) +
        '. Use target= to frame other layers in a new frame.');
    }
    modifyFrame(catalog, frames[0], opts);
  } else {
    validateModeOptions(opts, MODIFY_ONLY_OPTIONS, 'when changing a frame (target=<frame>)');
    createFrame(catalog, targets, items, opts, frames[0] || null);
  }
};

var CREATE_ONLY_OPTIONS = ['replace'];
var MODIFY_ONLY_OPTIONS = ['fit', 'auto_aspect', 'fix_scale', 'remove', 'add_layers',
  'order_layers', 'remove_layers', 'hide_layers', 'show_layers', 'above', 'below', 'top', 'bottom',
  'reproject', 'no_replace', 'overlay', 'overlay_position', 'overlay_margin', 'remove_overlay'];
var PAGE_OPTIONS = ['bbox', 'fit', 'width', 'height', 'aspect_ratio', 'auto_aspect',
  'fix_scale', 'margin', 'offset', 'offsets'];

function validateModeOptions(opts, names, modeLabel) {
  var found = names.filter(function(name) { return name in opts; });
  if (found.length > 0) {
    stop('Option' + utils.pluralSuffix(found.length) + ' only used',
      modeLabel + ':', found.map(formatOptionName).join(', '));
  }
}

function formatOptionName(name) {
  return name == 'no_replace' ? '+' : name.replace(/_/g, '-');
}

function getLayerName(o) {
  return o.layer.name || '[unnamed]';
}

function modifyFrame(catalog, frame, opts) {
  var operation = 'frame';
  var pageOpts;
  if (opts.no_replace) {
    frame = copyFrame(catalog, frame, opts.name);
  }
  if (opts.remove) {
    if (Object.keys(opts).some(function(k) { return k != 'remove' && k != 'target'; })) {
      stop('The remove option cannot be combined with other frame options');
    }
    removeFrame(catalog, frame);
    return;
  }
  if (!opts.no_replace && !Object.keys(opts).some(function(k) { return k != 'target'; })) {
    stop('Missing options for changing frame', getLayerName(frame));
  }

  // 1. members, their order and visibility
  if (opts.add_layers && opts.order_layers) {
    stop('add-layers= and order-layers= cannot be used together');
  }
  if (opts.add_layers) {
    addLayersToFrame(catalog, frame, opts);
  } else if (opts.order_layers) {
    orderFrameLayers(catalog, frame, opts);
  } else if (opts.above || opts.below || opts.top || opts.bottom) {
    stop('above=, below=, top and bottom are used with add-layers= or order-layers=');
  }
  if (opts.reproject && !opts.add_layers) {
    stop('reproject is used with add-layers=');
  }
  if (opts.remove_layers) {
    moveLayersToFrame(catalog, findFrameMembers(catalog, frame, opts.remove_layers), null);
  }
  if (opts.hide_layers) {
    findFrameMembers(catalog, frame, opts.hide_layers).forEach(function(o) {
      setFrameHidden(o.layer, true, operation);
    });
  }
  if (opts.show_layers) {
    findFrameMembers(catalog, frame, opts.show_layers).forEach(function(o) {
      setFrameHidden(o.layer, false, operation);
    });
  }

  // 2. page and extent
  pageOpts = PAGE_OPTIONS.concat('ignore_symbols').reduce(function(memo, name) {
    if (name in opts) memo[name] = opts[name];
    return memo;
  }, {});
  if (PAGE_OPTIONS.some(function(name) { return name in opts; })) {
    updateFrame([frame.layer], frame.dataset, pageOpts,
      opts.fit ? findLayers(catalog, opts.fit) : null);
  }

  // 3. overlays
  if ((opts.overlay_position || opts.overlay_margin !== undefined) && !opts.overlay) {
    stop('overlay-position= and overlay-margin= are used with overlay=');
  }
  if (opts.remove_overlay) {
    removeOverlay(catalog, frame, opts.remove_overlay);
  }
  if (opts.overlay) {
    overlayFrameOnHost(catalog, frame, findOverlayFrame(catalog, opts.overlay), opts);
  }

  // 4. name (a copy is named when it is made)
  if (opts.name && !opts.no_replace) {
    renameFrame(catalog, frame, opts.name);
  }
  catalog.setDefaultTarget([frame.layer], frame.dataset);
}

function findLayers(catalog, pattern) {
  return catalog.findLayers(pattern);
}

// Layers in the frame that match @pattern. Names are matched only among the
// members, so a layer of the same name outside the frame is never selected,
// and numbers count the members from 1 (as in frame1:2).
function findFrameMembers(catalog, frame, pattern) {
  var members = getFrameMemberLayers(catalog, frame);
  return findListedLayers(catalog, pattern, function(subpattern) {
    var found = catalog.findLayers(subpattern, members, true);
    if (found.length === 0) {
      stop('Frame', getLayerName(frame), 'has no layer matching', subpattern);
    }
    return found;
  });
}

// Layers outside the frame that match @pattern (unframed or in other frames).
// Members are skipped, so a member never shadows a layer of the same name
// outside the frame.
function findLayersOutsideFrame(catalog, frame, pattern) {
  var members = utils.pluck(getFrameMemberLayers(catalog, frame), 'layer');
  return findListedLayers(catalog, pattern, function(subpattern) {
    var found = findLayers(catalog, subpattern);
    var outside = found.filter(function(o) { return !members.includes(o.layer); });
    if (outside.length === 0) {
      stop(subpattern, 'is already in frame', getLayerName(frame) + '.',
        'Use order-layers= to restack layers in a frame');
    }
    return outside;
  });
}

// Layers matched by each comma-separated part of @pattern, in list order and
// without repeats. The layers that one part matches (e.g. a wildcard) are in
// stacking order.
// @find function(subpattern) -> [{layer, dataset}]
function findListedLayers(catalog, pattern, find) {
  var stack = getStackedLayers(catalog).map(function(o) { return o.layer; });
  return String(pattern).split(',').reduce(function(memo, subpattern) {
    var found = find(subpattern).filter(function(o) {
      return !memo.some(function(o2) { return o2.layer == o.layer; });
    });
    found.sort(function(a, b) { return stack.indexOf(a.layer) - stack.indexOf(b.layer); });
    return memo.concat(found);
  }, []);
}

// add-layers= brings layers into the frame, stacked in list order, first at
// the bottom, on top of the frame's other layers unless a position is given
function addLayersToFrame(catalog, frame, opts) {
  var items = findLayersOutsideFrame(catalog, frame, opts.add_layers);
  moveLayersToFrame(catalog, items, frame, {
    position: getStackPosition(catalog, frame, opts, items) || {top: true},
    ordered: true,
    reproject: opts.reproject
  });
}

// order-layers= restacks layers in the frame, in list order, first at the
// bottom. Without a position, the layers are restacked in place, starting
// where the lowest of them was.
function orderFrameLayers(catalog, frame, opts) {
  var items = findFrameMembers(catalog, frame, opts.order_layers);
  moveLayersInStack(catalog, utils.pluck(items, 'layer'),
    getStackPosition(catalog, frame, opts, items) || {in_place: true}, {
      group: utils.pluck(getFrameMemberLayers(catalog, frame), 'layer'),
      ordered: true,
      operation: 'frame'
    });
}

// Returns null if no position option is given
// @items the layers being moved, which the anchor of above= or below= must
//   not be one of
function getStackPosition(catalog, frame, opts, items) {
  var given = ['above', 'below', 'top', 'bottom'].filter(function(name) { return opts[name]; });
  var anchor;
  if (given.length > 1) {
    stop(given.join(', ') + ' are mutually exclusive');
  }
  if (opts.above || opts.below) {
    anchor = findFrameMembers(catalog, frame, opts.above || opts.below);
    if (anchor.length != 1) {
      stop((opts.above ? 'above=' : 'below=') + ' names more than one layer');
    }
    if (items.some(function(o) { return o.layer == anchor[0].layer; })) {
      stop((opts.above ? 'above=' : 'below=') + ' names a layer that is being moved:',
        getLayerName(anchor[0]));
    }
    return opts.above ? {above: anchor[0].layer} : {below: anchor[0].layer};
  }
  if (opts.bottom) return {bottom: true};
  if (opts.top) return {top: true};
  return null;
}

function findOverlayFrame(catalog, name) {
  var frame = getFrameByName(catalog, name);
  if (!frame) {
    stop('Unknown frame:', name);
  }
  return frame;
}

function removeOverlay(catalog, host, name) {
  var overlay = findOverlayFrame(catalog, name);
  if (!findOverlayLayer(host.dataset, overlay.dataset.id)) {
    stop('Frame', name, 'is not an overlay on frame', getLayerName(host));
  }
  setOverlayPlacement(host.dataset, overlay.dataset.id, null);
}

function renameFrame(catalog, frame, name) {
  var detail = {operation: 'frame', unit: 'name'};
  if (frame.layer.name == name) return;
  requireUnusedFrameName(catalog, name);
  noteLayerMetadataWillChange(frame.layer, detail);
  frame.layer.name = name;
  markLayerMetadataChanged(frame.layer, detail);
}

function requireUnusedFrameName(catalog, name) {
  if (getFrameByName(catalog, name)) {
    stop('A map frame named', name, 'already exists. Use target=' + name,
      'to change it, or choose another name.');
  }
}

// frame, frame2, frame3, ...
function getUnusedFrameName(catalog) {
  var name = 'frame';
  for (var i = 2; getFrameByName(catalog, name); i++) {
    name = 'frame' + i;
  }
  return name;
}

// The frame layer becomes an ordinary rectangle; its members become unframed
function removeFrame(catalog, frame) {
  var operation = 'frame';
  getFrameMemberLayers(catalog, frame).forEach(function(o) {
    setFrameHidden(o.layer, false, operation);
  });
  getFrameMembers(catalog, frame).forEach(function(dataset) {
    setFrameRef(dataset, null);
  });
  demoteFrameLayer(frame.layer, operation);
}

// Copies the frame dataset and its member datasets. Copies get new IDs;
// members that share an ID (one lineage) share a new one.
function copyFrame(catalog, frame, name) {
  var members = getFrameMembers(catalog, frame);
  var ids = {};
  var copy, frameLyr;
  if (!name) {
    stop('Use name= to name the copy of frame', getLayerName(frame));
  }
  requireUnusedFrameName(catalog, name);
  copy = copyDataset(frame.dataset);
  copy.info = utils.extend({}, frame.dataset.info);
  frameLyr = findFrameLayerInDataset(copy);
  frameLyr.name = name;
  catalog.insertDatasetAfter(copy, null);
  members.forEach(function(dataset) {
    var member = copyDataset(dataset);
    member.info = utils.extend({}, dataset.info, {frame: copy.id});
    if (dataset.id) {
      member.id = ids[dataset.id] || (ids[dataset.id] = createDatasetId());
    }
    catalog.insertDatasetAfter(member, null);
  });
  return {layer: frameLyr, dataset: copy};
}

function createFrame(catalog, targets, items, opts, frameTarget) {
  var widthPx, heightPx, bbox;
  var replaced = opts.replace ? frameTarget || getReplacedFrame(catalog, items) : null;
  var contentItems = items.filter(function(o) {
    return !isFrameComponentLayer(o.layer, o.dataset);
  });
  var name = opts.name || replaced && replaced.layer.name || getUnusedFrameName(catalog);
  var hadFrames = getFrames(catalog).length > 0;
  var offsets = parseFrameOffsets(opts);
  if (getFrameByName(catalog, name) && (!replaced || replaced.layer.name != name)) {
    requireUnusedFrameName(catalog, name);
  }
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
    requireSameCoordinateSpace(datasets, 'Unable to frame layers in different coordinate ' +
      'systems: targets include both projected and lat-long coordinates. Use -proj to project ' +
      'the lat-long layers, or frame them separately.');
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
  var frame = {layer: frameLyr, dataset: frameDataset};
  var members = replaced ? getFrameMembers(catalog, replaced) : [];
  frameLyr.name = name;
  if (replaced) {
    moveFrameFurniture(replaced.dataset, frameDataset);
    demoteFrameLayer(replaced.layer);
  }
  // target the frame, not any furniture that came with it
  catalog.setDefaultTarget([frameLyr], frameDataset);
  members.forEach(function(dataset) {
    setFrameRef(dataset, frameDataset.id);
  });
  if (replaced) {
    retargetOverlayPlacements(catalog, replaced.dataset.id, frameDataset.id);
  }
  // With bbox= and no target=, the frame does not need content, and the
  // current target does not become a member
  if (contentItems.length > 0 && (opts.target || !opts.bbox)) {
    moveLayersToFrame(catalog, contentItems, frame);
  }
  if (hadFrames && !opts.target && !replaced) {
    message('Created map frame', name + '. To change an existing frame, use target=<frame>.');
  }
}

// The frame that -frame replace replaces: the frame of the targets, or the
// session's frame if it has only one
function getReplacedFrame(catalog, items) {
  var frames = items.reduce(function(memo, o) {
    var frame = getFrameForDataset(catalog, o.dataset);
    if (frame && !memo.some(function(f) { return f.dataset == frame.dataset; })) {
      memo.push(frame);
    }
    return memo;
  }, []);
  if (frames.length > 1) {
    stop('The targets are in more than one frame; unable to tell which frame to replace');
  }
  return frames[0] || getDefaultFrame(catalog);
}

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
