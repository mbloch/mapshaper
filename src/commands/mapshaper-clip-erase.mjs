import { filterClipSlivers } from '../commands/mapshaper-filter-slivers';
import { clipPolylines } from '../clipping/mapshaper-polyline-clipping';
import { clipPolygons } from '../clipping/mapshaper-polygon-clipping';
import { clipPoints } from '../clipping/mapshaper-point-clipping';
import { requirePolygonLayer, getLayerBounds, layerHasRaster } from '../dataset/mapshaper-layer-utils';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { mergeLayersForOverlay2, normalizeOverlaySource } from '../clipping/mapshaper-overlay-utils';
import { divideDatasetByBBox } from '../clipping/mapshaper-bbox2-clipping';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { getDatasetCRS, isLatLngCRS } from '../crs/mapshaper-projections';
import cmd from '../mapshaper-cmd';
import { stop, message, warnOnce } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { ArcCollection } from '../paths/mapshaper-arcs';
import { NodeCollection } from '../topology/mapshaper-nodes';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { dissolvePolygonLayer2 } from '../dissolve/mapshaper-polygon-dissolve2';
import { profileStart, profileEnd } from '../utils/mapshaper-profile';
import { markDatasetChanged, noteDatasetWillChange } from '../undo/mapshaper-undo-tracking';
import { clipRasterToBBox } from '../rasters/mapshaper-raster-utils';

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
    if (lyr2.raster) {
      lyr.raster = lyr2.raster;
      lyr.raster_type = lyr2.raster_type;
    }
  });
  dissolveArcs(dataset);
}

// @clipSrc: layer in @dataset or filename
// @type: 'clip' or 'erase'
export function clipLayers(targetLayers, clipSrc, targetDataset, type, opts) {
  profileStart('clipLayers');
  opts = opts || {no_cleanup: true}; // TODO: update testing functions
  var usingPathClip = utils.some(targetLayers, layerHasPaths);
  var usingRasterClip = utils.some(targetLayers, layerHasRaster);
  var mergedDataset, clipLyr, nodes, result;
  var clipDataset;
  if (usingRasterClip) {
    result = clipRasterLayers(targetLayers, clipSrc, targetDataset, type, opts);
    profileEnd('clipLayers');
    return result;
  }
  clipDataset = normalizeOverlaySource(clipSrc, targetDataset, opts);
  if (!opts.no_warn) {
    warnIfBoundsDontOverlap(targetLayers, targetDataset, clipDataset, type);
  }
  if (opts.bbox2 && usingPathClip) { // assumes target dataset has arcs
    result = clipLayersByBBox(targetLayers, targetDataset, opts);
    profileEnd('clipLayers');
    return result;
  }
  if (!usingPathClip) {
    result = clipLayersByClipDataset(targetLayers, clipDataset, type, opts);
    profileEnd('clipLayers');
    return result;
  }
  profileStart('mergeLayersForOverlay');
  mergedDataset = mergeLayersForOverlay2(targetLayers, targetDataset, clipDataset);
  profileEnd('mergeLayersForOverlay');
  clipLyr = mergedDataset.layers[mergedDataset.layers.length-1];
  nodes = addIntersectionCuts(mergedDataset, opts);
  noteDatasetWillChange(targetDataset, {operation: type, unit: 'arcs'});
  targetDataset.arcs = mergedDataset.arcs;
  markDatasetChanged(targetDataset, {operation: type, unit: 'arcs'});
  profileStart('clipDissolvePolygonLayer2');
  clipLyr = utils.defaults({data: null}, clipLyr);
  clipLyr = dissolvePolygonLayer2(clipLyr, mergedDataset, {quiet: true, silent: true});
  profileEnd('clipDissolvePolygonLayer2');

  profileStart('clipLayersByLayer');
  result = clipLayersByLayer(targetLayers, clipLyr, nodes, type, opts);
  profileEnd('clipLayersByLayer');
  profileEnd('clipLayers');
  return result;
}

function clipLayersByClipDataset(targetLayers, clipDataset, type, opts) {
  var clipLyr = clipDataset.layers[0];
  var nodes = new NodeCollection(clipDataset.arcs);
  var result;
  profileStart('clipLayersByLayer');
  result = clipLayersByLayer(targetLayers, clipLyr, nodes, type, opts);
  profileEnd('clipLayersByLayer');
  return result;
}

function clipRasterLayers(targetLayers, clipSrc, targetDataset, type, opts) {
  var clipDataset, clipBounds, bbox;
  if (type != 'clip') {
    stop('Raster layers only support clipping');
  }
  if (utils.some(targetLayers, function(lyr) {return !layerHasRaster(lyr);})) {
    stop('Raster clipping cannot be mixed with vector target layers');
  }
  if (opts.bbox2) {
    bbox = opts.bbox2;
  } else {
    clipDataset = normalizeOverlaySource(clipSrc, targetDataset, opts);
    clipBounds = getLayerBounds(clipDataset.layers[0], clipDataset.arcs);
    if (!clipBounds || !clipBounds.hasBounds()) {
      stop('Missing raster clipping bounds');
    }
    bbox = clipBounds.toArray();
  }
  return targetLayers.map(function(lyr) {
    clipRasterToBBox(lyr, bbox, opts);
    return lyr;
  });
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

// Warn (once per source/target pair) when a -clip / -erase / slice almost
// certainly won't do what the user wants. Two checks, in order of strength:
//
//   1. CRS mismatch -- one side is lat/lng and the other is projected. This
//      uses the same logic as requireDatasetsHaveCompatibleCRS() in
//      mapshaper-merging.mjs, but fires here as a friendlier, command-aware
//      warning before mergeDatasets() would otherwise stop() with a generic
//      message. It also catches a class of cases the bbox check misses: a
//      projected layer whose bbox straddles (0,0) often *does* overlap an
//      unprojected lat/lng bbox, even though the two are useless together.
//   2. Bbox-disjoint -- a fallback for the case where CRSes look compatible
//      (or are unknown on both sides) but the layers clearly aren't in the
//      same place. Usually a wrong-source-picker error.
//
// Empty target layers are ignored (separate failure mode; would just be
// noise). The CRS warning suppresses the bbox warning for the same target,
// so users see one warning per problem, not two.
// Skipped entirely if opts.no_warn is set.
export function warnIfBoundsDontOverlap(targetLayers, targetDataset, clipDataset, type) {
  var srcCRS = getDatasetCRS(clipDataset);
  var targetCRS = getDatasetCRS(targetDataset);
  var crsMismatch = srcCRS && targetCRS && isLatLngCRS(srcCRS) != isLatLngCRS(targetCRS);
  var srcName = clipDataset.layers[0].name || '<unnamed>';
  var srcBounds = getLayerBounds(clipDataset.layers[0], clipDataset.arcs);
  targetLayers.forEach(function(targetLyr) {
    var targetBounds = getLayerBounds(targetLyr, targetDataset.arcs);
    if (!targetBounds || !targetBounds.hasBounds()) return;
    if (crsMismatch) {
      warnOnce(formatCRSMismatchMessage(type, srcName, targetLyr.name,
        srcCRS, targetCRS));
      return; // Don't also fire the (likely-misleading) bbox warning.
    }
    if (!srcBounds || !srcBounds.hasBounds()) return;
    if (srcBounds.intersects(targetBounds)) return;
    warnOnce(formatNoOverlapMessage(type, srcName, targetLyr.name,
      srcBounds, targetBounds));
  });
}

function formatCRSMismatchMessage(type, srcName, targetName, srcCRS, targetCRS) {
  var verb = type === 'erase' ? 'erase' : 'clip';
  var srcKind = isLatLngCRS(srcCRS) ? 'lng/lat (geographic)' : 'projected';
  var targetKind = isLatLngCRS(targetCRS) ? 'lng/lat (geographic)' : 'projected';
  return '-' + verb + ': source "' + srcName + '" uses ' + srcKind +
    ' coordinates but target "' + (targetName || '<unnamed>') + '" uses ' +
    targetKind + ' coordinates. The -' + verb +
    ' will not produce a useful result; project one side to match the other first.';
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


