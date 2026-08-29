import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { stop, message } from '../utils/mapshaper-logging';
import { Bounds } from '../geom/mapshaper-bounds';
import { requireSinglePointLayer, getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { requireProjectedDataset } from '../crs/mapshaper-projections';
import { getSymbolPropertyAccessor } from '../svg/svg-properties';
import { findFrameLayerInDataset, findFrame, getFrameLayerData } from '../furniture/mapshaper-frame-utils';
import { noteLayerWillChange, markLayerChanged } from '../undo/mapshaper-undo-tracking';
import {
  resolveSymbolCollisions,
  countSymbolCollisions,
  symbolCollisionDefaults
} from '../points/mapshaper-symbol-collisions';

// Move circular symbols apart to reduce overlaps, keeping each one within a
// fixed pixel distance of its true position.
//
// The layout runs in the pixel space of the map that the symbols will be
// rendered in, so the command needs to know the display scale: either from a
// frame associated with the target, or from a width= option.
//
// All targeted layers are laid out in a single simulation, so symbols in
// different layers are moved apart from each other as well.
var DEFAULT_PADDING = 0; // pixels

cmd.repel = function(targetLayers, dataset, catalog, opts) {
  var maxShift = opts.max_shift >= 0 ? opts.max_shift : symbolCollisionDefaults.max_shift;
  var padding = opts.padding >= 0 ? opts.padding : DEFAULT_PADDING;
  var solverOpts = {
    ticks: opts.ticks > 0 ? opts.ticks : symbolCollisionDefaults.ticks,
    strength: opts.strength > 0 ? opts.strength : symbolCollisionDefaults.strength,
    max_shift: maxShift
  };
  var nodes = [];

  // Validated before the display scale is resolved, so that an unusable target
  // is reported as such instead of as a missing width= option.
  requireProjectedDataset(dataset);
  targetLayers.forEach(function(lyr) {
    requireRepelTarget(lyr, opts);
  });
  var pixelsPerUnit = getDisplayScale(targetLayers, dataset, catalog, opts);
  targetLayers.forEach(function(lyr) {
    addLayerNodes(nodes, lyr, pixelsPerUnit, padding, opts);
  });
  if (nodes.length === 0) {
    stop('Targeted layer(s) contain no circle symbols to move.');
  }

  var collisionsBefore = countSymbolCollisions(nodes);
  var moved = resolveSymbolCollisions(nodes, solverOpts);
  var collisionsAfter = countSymbolCollisions(nodes);
  applyDisplacement(nodes, pixelsPerUnit);
  reportResults(nodes.length, moved, collisionsBefore, collisionsAfter, maxShift);
};

// Symbols are displaced by adding an offset to their original coordinates, so
// that symbols that didn't move keep bit-for-bit identical coordinates.
// Displaced symbols get a new coordinate array rather than an updated one,
// because the GeoJSON importer reuses the arrays it is given and mutating them
// would reach back into a caller's input object.
function applyDisplacement(nodes, pixelsPerUnit) {
  var movedNodes = nodes.filter(function(node) {
    return node.x !== node.x0 || node.y !== node.y0;
  });
  var movedLayers = [];
  movedNodes.forEach(function(node) {
    if (movedLayers.indexOf(node.lyr) == -1) movedLayers.push(node.lyr);
  });
  movedLayers.forEach(function(lyr) {
    noteLayerWillChange(lyr, {operation: 'repel', unit: 'shapes'});
  });
  movedNodes.forEach(function(node) {
    node.shp[0] = [
      node.shp[0][0] + (node.x - node.x0) / pixelsPerUnit,
      node.shp[0][1] + (node.y - node.y0) / pixelsPerUnit
    ];
  });
  movedLayers.forEach(function(lyr) {
    markLayerChanged(lyr, {operation: 'repel', unit: 'shapes'});
  });
}

function reportResults(total, moved, before, after, maxShift) {
  var msg = utils.format('Moved %d of %d symbol%s', moved, total, total == 1 ? '' : 's');
  if (after > 0) {
    msg += utils.format('; %d of %d overlap%s remain (try a larger max-shift= than %d)',
      after, before, before == 1 ? '' : 's', maxShift);
  } else if (before > 0) {
    msg += utils.format('; resolved %d overlap%s', before, before == 1 ? '' : 's');
  } else {
    msg += ' (no overlaps found)';
  }
  message(msg);
}

function requireRepelTarget(lyr, opts) {
  requireSinglePointLayer(lyr,
    '-repel requires single points; layer contains multi-point features.');
  if (!opts.radius && !layerHasCircleSymbols(lyr)) {
    stop('-repel requires a layer containing circle symbols ' +
      '(see the -symbols and -style commands), or a radius= option.');
  }
}

function layerHasCircleSymbols(lyr) {
  return !!lyr.data && (lyr.data.fieldExists('svg-symbol') || lyr.data.fieldExists('r'));
}

function addLayerNodes(nodes, lyr, pixelsPerUnit, padding, opts) {
  var getRadius = getRadiusAccessor(lyr, opts);
  var i, shp, p, r;
  for (i=0; i<lyr.shapes.length; i++) {
    shp = lyr.shapes[i];
    p = shp ? shp[0] : null;
    if (!p) continue;
    r = getRadius(i);
    if (!(r > 0) || !isFinite(p[0]) || !isFinite(p[1])) continue;
    nodes.push({
      lyr: lyr,
      shp: shp,
      i: nodes.length,
      x: p[0] * pixelsPerUnit,
      y: p[1] * pixelsPerUnit,
      x0: p[0] * pixelsPerUnit,
      y0: p[1] * pixelsPerUnit,
      r: r + padding
    });
  }
}

// Radii come from one of three places: an explicit radius= option, the
// svg-symbol field written by -symbols, or the r field written by -style.
// Deliberately not using getSymbolRadius(), whose default of 5 would invent
// radii for symbols that don't exist.
function getRadiusAccessor(lyr, opts) {
  if (opts.radius) {
    return getSymbolPropertyAccessor(opts.radius, 'radius', lyr);
  }
  var records = lyr.data.getRecords();
  return function(i) {
    var rec = records[i];
    if (!rec) return 0;
    if (rec['svg-symbol']) return getCircleSymbolRadius(rec['svg-symbol']);
    return rec.r > 0 ? +rec.r : 0;
  };
}

function getCircleSymbolRadius(sym) {
  if (utils.isString(sym)) {
    try {
      sym = JSON.parse(sym);
    } catch(e) {
      return 0;
    }
  }
  if (!sym || sym.type != 'circle') {
    stop('-repel currently supports circle symbols only' +
      (sym && sym.type ? ' (found a ' + sym.type + ' symbol).' : '.'));
  }
  return sym.r > 0 ? +sym.r : 0;
}

// Returns the number of display pixels per map coordinate unit.
function getDisplayScale(targetLayers, dataset, catalog, opts) {
  var frame, bounds, extent;
  if (opts.width > 0) {
    bounds = getCombinedBounds(targetLayers, dataset);
    // A layer of collinear points has no width; fall back to its height so that
    // width= still gives a usable scale.
    extent = bounds.width() || bounds.height();
    if (!(extent > 0)) {
      stop('Unable to calculate a display scale: targeted symbols have no extent.');
    }
    return opts.width / extent;
  }
  frame = findRepelFrame(dataset, catalog);
  if (!frame) {
    stop('-repel requires a width= option when the target has no frame.');
  }
  warnIfFrameMismatched(frame, targetLayers, dataset);
  return getFramePixelsPerUnit(frame);
}

function findRepelFrame(dataset, catalog) {
  var lyr = findFrameLayerInDataset(dataset);
  var target;
  if (lyr) return getFrameLayerData(lyr, dataset.arcs);
  // -frame adds the frame it creates to the catalog as a separate dataset, so a
  // catalog-wide search is needed to find it (-scalebar does the same).
  target = catalog ? findFrame(catalog) : null;
  return target ? getFrameLayerData(target.layer, target.dataset.arcs) : null;
}

// Mirrors the transform applied by fitDatasetToFrame(), so that the layout
// matches the pixels that get rendered. A naive width / bbox width differs
// whenever the frame bbox and its pixel dimensions have different aspect ratios.
function getFramePixelsPerUnit(frameData) {
  var bounds = new Bounds(frameData.bbox);
  var bounds2 = frameData.bbox2 ? new Bounds(frameData.bbox2) :
    new Bounds(0, 0, frameData.width, frameData.height);
  bounds.fillOut(bounds2.width() / bounds2.height());
  return bounds.getTransform(bounds2).mx;
}

function warnIfFrameMismatched(frame, targetLayers, dataset) {
  var bounds = getCombinedBounds(targetLayers, dataset);
  if (!bounds.hasBounds()) return;
  if (!new Bounds(frame.bbox).intersects(bounds)) {
    message('[repel] Warning: the frame does not overlap the targeted symbols. ' +
      'If the data was projected after the frame was made, the display scale is wrong.');
  }
}

function getCombinedBounds(targetLayers, dataset) {
  return targetLayers.reduce(function(memo, lyr) {
    var bounds = getLayerBounds(lyr, dataset.arcs);
    return bounds ? memo.mergeBounds(bounds) : memo;
  }, new Bounds());
}
