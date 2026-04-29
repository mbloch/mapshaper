import { filterClipSlivers } from '../commands/mapshaper-filter-slivers';
import { clipPolylines } from '../clipping/mapshaper-polyline-clipping';
import { clipPolygons } from '../clipping/mapshaper-polygon-clipping';
import { clipPoints } from '../clipping/mapshaper-point-clipping';
import { requirePolygonLayer, getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { mergeLayersForOverlay2, normalizeOverlaySource } from '../clipping/mapshaper-overlay-utils';
import { divideDatasetByBBox } from '../clipping/mapshaper-bbox2-clipping';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { Bounds } from '../geom/mapshaper-bounds';
import cmd from '../mapshaper-cmd';
import { stop, message, warnOnce } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { ArcCollection } from '../paths/mapshaper-arcs';
import { NodeCollection } from '../topology/mapshaper-nodes';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { dissolvePolygonLayer2 } from '../dissolve/mapshaper-polygon-dissolve2';
import { profileStart, profileEnd } from '../utils/mapshaper-profile';

cmd.clipLayers = function(target, src, dataset, opts) {
  return clipLayers(target, src, dataset, "clip", opts);
};

cmd.eraseLayers = function(target, src, dataset, opts) {
  return clipLayers(target, src, dataset, "erase", opts);
};

cmd.clipLayer = function(targetLyr, src, dataset, opts) {
  return cmd.clipLayers([targetLyr], src, dataset, opts)[0];
};

cmd.eraseLayer = function(targetLyr, src, dataset, opts) {
  return cmd.eraseLayers([targetLyr], src, dataset, opts)[0];
};

cmd.sliceLayers = function(target, src, dataset, opts) {
  return clipLayers(target, src, dataset, "slice", opts);
};

cmd.sliceLayer = function(targetLyr, src, dataset, opts) {
  return cmd.sliceLayers([targetLyr], src, dataset, opts);
};

export function clipLayersInPlace(layers, clipSrc, dataset, type, opts) {
  var outputLayers = clipLayers(layers, clipSrc, dataset, type, opts);
  // remove arcs from the clipping dataset, if they are not used by any layer
  layers.forEach(function(lyr, i) {
    var lyr2 = outputLayers[i];
    lyr.shapes = lyr2.shapes;
    lyr.data = lyr2.data;
  });
  dissolveArcs(dataset);
}

// @clipSrc: layer in @dataset or filename
// @type: 'clip' or 'erase'
export function clipLayers(targetLayers, clipSrc, targetDataset, type, opts) {
  profileStart('clipLayers');
  opts = opts || {no_cleanup: true}; // TODO: update testing functions
  var usingPathClip = utils.some(targetLayers, layerHasPaths);
  var mergedDataset, clipLyr, nodes, result;
  var clipDataset = normalizeOverlaySource(clipSrc, targetDataset, opts);
  if (!opts.no_warn) {
    warnIfBoundsDontOverlap(targetLayers, targetDataset, clipDataset, type);
  }
  if (opts.bbox2 && usingPathClip) { // assumes target dataset has arcs
    result = clipLayersByBBox(targetLayers, targetDataset, opts);
    profileEnd('clipLayers');
    return result;
  }
  profileStart('mergeLayersForOverlay');
  mergedDataset = mergeLayersForOverlay2(targetLayers, targetDataset, clipDataset);
  profileEnd('mergeLayersForOverlay');
  clipLyr = mergedDataset.layers[mergedDataset.layers.length-1];
  if (usingPathClip) {
    nodes = addIntersectionCuts(mergedDataset, opts);
    targetDataset.arcs = mergedDataset.arcs;
    profileStart('clipDissolvePolygonLayer2');
    clipLyr = utils.defaults({data: null}, clipLyr);
    clipLyr = dissolvePolygonLayer2(clipLyr, mergedDataset, {quiet: true, silent: true});
    profileEnd('clipDissolvePolygonLayer2');

  } else {
    nodes = new NodeCollection(mergedDataset.arcs);
  }

  profileStart('clipLayersByLayer');
  result = clipLayersByLayer(targetLayers, clipLyr, nodes, type, opts);
  profileEnd('clipLayersByLayer');
  profileEnd('clipLayers');
  return result;
}

export function clipLayersByBBox(layers, dataset, opts) {
  var bbox = opts.bbox2;
  var clipLyr = divideDatasetByBBox(dataset, bbox);
  var nodes = new NodeCollection(dataset.arcs);
  var retn = clipLayersByLayer(layers, clipLyr, nodes, 'clip', opts);
  return retn;
}

export function clipLayersByLayer(targetLayers, clipLyr, nodes, type, opts) {
  requirePolygonLayer(clipLyr, "Requires a polygon clipping layer");
  return targetLayers.reduce(function(memo, targetLyr) {
    if (type == 'slice') {
      memo = memo.concat(sliceLayerByLayer(targetLyr, clipLyr, nodes, opts));
    } else {
      memo.push(clipLayerByLayer(targetLyr, clipLyr, nodes, type, opts));
    }
    return memo;
  }, []);
}

function getSliceLayerName(clipLyr, field, i) {
  var id = field ? clipLyr.data.getRecords()[0][field] : i + 1;
  return 'slice-' + id;
}

function sliceLayerByLayer(targetLyr, clipLyr, nodes, opts) {
  // may not need no_replace
  var clipLayers = cmd.splitLayer(clipLyr, opts.id_field, {no_replace: true});
  return clipLayers.map(function(clipLyr, i) {
    var outputLyr = clipLayerByLayer(targetLyr, clipLyr, nodes, 'clip', opts);
    outputLyr.name = getSliceLayerName(clipLyr, opts.id_field, i);
    return outputLyr;
  });
}

function clipLayerByLayer(targetLyr, clipLyr, nodes, type, opts) {
  var arcs = nodes.arcs;
  var shapeCount = targetLyr.shapes ? targetLyr.shapes.length : 0;
  var nullCount = 0, sliverCount = 0;
  var clippedShapes, outputLyr;
  if (shapeCount === 0) {
    return targetLyr; // ignore empty layer
  }
  if (targetLyr === clipLyr) {
    stop('Can\'t clip a layer with itself');
  }

  // TODO: optimize some of these functions for bbox clipping
  if (targetLyr.geometry_type == 'point') {
    clippedShapes = clipPoints(targetLyr.shapes, clipLyr.shapes, arcs, type);
  } else if (targetLyr.geometry_type == 'polygon') {
    clippedShapes = clipPolygons(targetLyr.shapes, clipLyr.shapes, nodes, type, opts);
  } else if (targetLyr.geometry_type == 'polyline') {
    clippedShapes = clipPolylines(targetLyr.shapes, clipLyr.shapes, nodes, type);
  } else {
    stop('Invalid target layer:', targetLyr.name);
  }

  outputLyr = {
    name: targetLyr.name,
    geometry_type: targetLyr.geometry_type,
    shapes: clippedShapes,
    data: targetLyr.data // replaced post-filter
  };

  // Remove sliver polygons
  if (opts.remove_slivers && outputLyr.geometry_type == 'polygon') {
    sliverCount = filterClipSlivers(outputLyr, clipLyr, arcs);
  }

  // Remove null shapes (likely removed by clipping/erasing, although possibly already present)
  cmd.filterFeatures(outputLyr, arcs, {remove_empty: true, verbose: false});

  // clone data records (to avoid sharing records between layers)
  // TODO: this is not needed when replacing target with a single layer
  if (outputLyr.data) {
    outputLyr.data = outputLyr.data.clone();
  }

  // TODO: redo messages, now that many layers may be clipped
  nullCount = shapeCount - outputLyr.shapes.length;
  if (nullCount && sliverCount) {
    message(getClipMessage(nullCount, sliverCount));
  }
  return outputLyr;
}

export function getClipMessage(nullCount, sliverCount) {
  var nullMsg = nullCount ? utils.format('%,d null feature%s', nullCount, utils.pluralSuffix(nullCount)) : '';
  var sliverMsg = sliverCount ? utils.format('%,d sliver%s', sliverCount, utils.pluralSuffix(sliverCount)) : '';
  if (nullMsg || sliverMsg) {
    return utils.format('Removed %s%s%s', nullMsg, (nullMsg && sliverMsg ? ' and ' : ''), sliverMsg);
  }
  return '';
}

// Warn (once per source/target pair) if a -clip / -erase / slice is being
// asked to operate on layers whose bounding boxes don't overlap. The common
// causes are CRS mismatch or picking the wrong source layer. Empty layers
// are ignored: they're a separate failure mode and would produce noisy false
// positives. Skipped if opts.no_warn is set.
export function warnIfBoundsDontOverlap(targetLayers, targetDataset, clipDataset, type) {
  var srcBounds = getLayerBounds(clipDataset.layers[0], clipDataset.arcs);
  if (!srcBounds || !srcBounds.hasBounds()) return;
  var srcName = clipDataset.layers[0].name || '<unnamed>';
  targetLayers.forEach(function(targetLyr) {
    var targetBounds = getLayerBounds(targetLyr, targetDataset.arcs);
    if (!targetBounds || !targetBounds.hasBounds()) return;
    if (srcBounds.intersects(targetBounds)) return;
    warnOnce(formatNoOverlapMessage(type, srcName, targetLyr.name,
      srcBounds, targetBounds));
  });
}

function formatNoOverlapMessage(type, srcName, targetName, srcBounds, targetBounds) {
  // 'slice' is a per-feature -clip variant; in user terms it has the same
  // empty-output failure mode as clip, so we describe it under the same
  // verb to keep the message simple.
  var verb = type === 'erase' ? 'erase' : 'clip';
  var consequence = type === 'erase'
    ? 'will leave "' + (targetName || '<unnamed>') + '" unchanged'
    : 'will produce empty output for "' + (targetName || '<unnamed>') + '"';
  return '-' + verb + ': source "' + srcName + '" ' + bbToText(srcBounds) +
    ' does not overlap target "' + (targetName || '<unnamed>') + '" ' +
    bbToText(targetBounds) + '. The -' + verb + ' ' + consequence +
    '. This usually indicates a coordinate system mismatch.';
}

function bbToText(b) {
  return JSON.stringify(b.toArray());
}


