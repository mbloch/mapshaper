import { filterClipSlivers } from '../commands/mapshaper-filter-slivers';
import { clipPolylines } from '../clipping/mapshaper-polyline-clipping';
import { clipPolygons } from '../clipping/mapshaper-polygon-clipping';
import { clipPoints } from '../clipping/mapshaper-point-clipping';
import { requirePolygonLayer } from '../dataset/mapshaper-layer-utils';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { mergeLayersForOverlay } from '../clipping/mapshaper-overlay-utils';
import { divideDatasetByBBox } from '../clipping/mapshaper-bbox2-clipping';
import { layerHasPaths } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import { stop, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { ArcCollection } from '../paths/mapshaper-arcs';
import { NodeCollection } from '../topology/mapshaper-nodes';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { dissolvePolygonLayer2 } from '../dissolve/mapshaper-polygon-dissolve2';

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
  var usingPathClip = utils.some(targetLayers, layerHasPaths);
  var mergedDataset, clipLyr, nodes;
  opts = opts || {no_cleanup: true}; // TODO: update testing functions
  if (opts.bbox2 && usingPathClip) { // assumes target dataset has arcs
    return clipLayersByBBox(targetLayers, targetDataset, opts);
  }
  mergedDataset = mergeLayersForOverlay(targetLayers, targetDataset, clipSrc, opts);
  clipLyr = mergedDataset.layers[mergedDataset.layers.length-1];
  if (usingPathClip) {
    // add vertices at all line intersections
    // (generally slower than actual clipping)
    nodes = addIntersectionCuts(mergedDataset, opts);
    targetDataset.arcs = mergedDataset.arcs;
    // dissolve clip layer shapes (to remove overlaps and other topological issues
    // that might confuse the clipping function)
    // use a data-free copy of the clip lyr, so data records are not dissolved
    // (this avoids triggering an unnecessary and expensive DBF read operation in some cases).
    clipLyr = utils.defaults({data: null}, clipLyr);
    clipLyr = dissolvePolygonLayer2(clipLyr, mergedDataset, {quiet: true, silent: true});

  } else {
    nodes = new NodeCollection(mergedDataset.arcs);
  }
  // clipLyr = mergedDataset.layers.pop();
  return clipLayersByLayer(targetLayers, clipLyr, nodes, type, opts);
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


