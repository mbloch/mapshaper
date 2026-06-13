import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { makePolygonBuffer } from '../buffer/mapshaper-polygon-buffer';
import { makePolylineBuffer, makeOffsetLines } from '../buffer/mapshaper-polyline-buffer';
import { makePointBuffer } from '../buffer/mapshaper-point-buffer';
import { setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { mergeOutputLayersIntoDataset } from '../dataset/mapshaper-dataset-utils';
import {
  withActiveUndoTransaction,
  noteDatasetWillChange,
  noteLayerWillChange
} from '../undo/mapshaper-undo-tracking';
import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';

// TODO: consider if layers should be buffered together
// cmd.buffer = function(layers, dataset, opts) {
//   return makeBufferLayer(layers[0], dataset, opts);
// };

cmd.buffer = makeBufferLayer;

// Buffering builds a throwaway dataset (offset/round geometry, intersection
// cuts, dissolve, topology rebuild) that never enters the catalog, then merges
// it into the target dataset, replacing the source layer's geometry. When a GUI
// undo transaction is active, every in-place mutation along that path is
// otherwise captured -- including the buffer's massive pre-dissolve intermediate
// arc collections. That makes undo of a buffer command pathologically slow
// (large typed arrays get copied, serialized to IndexedDB, and restored, all
// uselessly, since the only state worth restoring is the target dataset's
// pre-buffer arcs/layers and the source layer's shapes).
//
// Instead, record the pre-buffer state of exactly what the buffer replaces, then
// run the whole operation with undo tracking suspended. The dataset-level unit
// holds the previous ArcCollection by reference, so undo/redo become cheap ref
// swaps rather than coordinate-array copies.
function makeBufferLayer(lyr, dataset, opts) {
  noteDatasetWillChange(dataset, {operation: 'buffer'});
  if (!opts.no_replace) {
    noteLayerWillChange(lyr, {operation: 'buffer'});
  }
  return withActiveUndoTransaction(null, function() {
    return buildAndMergeBuffer(lyr, dataset, opts);
  });
}

function buildAndMergeBuffer(lyr, dataset, opts) {
  var dataset2;
  if (opts.offset_left || opts.offset_right) {
    // offset-left/offset-right: emit the outside edge of the one-sided buffer
    // as a line layer, rather than the buffer polygon.
    if (opts.offset_left && opts.offset_right) {
      stop('Use either offset-left or offset-right, not both');
    }
    if (lyr.geometry_type != 'polyline') {
      stop('The offset-left and offset-right options require a polyline layer');
    }
    // Offset lines already end square: the buffer is built with round caps and
    // the cap vertices past the path endpoints are trimmed at their
    // perpendiculars, so the offset curve stops at the endpoint offset (no round
    // cap loop). Forcing a flat cap_style instead would leave the flat cap's
    // corner vertices in the extracted curve, so the construction keeps round
    // caps regardless of this default.
    dataset2 = makeOffsetLines(lyr, dataset, Object.assign({}, opts,
      {left: !!opts.offset_left, right: !!opts.offset_right,
        offset_left: false, offset_right: false}));
    return mergeOutputLayersIntoDataset(lyr, dataset, dataset2, opts);
  }
  if (opts.left && opts.right) {
    // buffering both sides = an ordinary two-sided buffer; normalizing here
    // keeps downstream code paths consistent (a two-sided buffer has no
    // buffered "side", so it skips one-sided wrong-side lobe removal)
    opts = Object.assign({}, opts, {left: false, right: false});
  }
  if (lyr.geometry_type == 'polyline' && (!!opts.left !== !!opts.right) &&
      !opts.cap_style) {
    // One-sided line buffers default to flat caps: the "cap" is the open end of
    // the offset band, where a round cap bulges out past the end of the path.
    opts = Object.assign({}, opts, {cap_style: 'flat'});
  }
  if (opts.topological && lyr.geometry_type != 'polygon') {
    stop('The topological buffer option requires a polygon layer');
  }
  if (lyr.geometry_type == 'point') {
    dataset2 = makePointBuffer(lyr, dataset, opts);
  } else if (lyr.geometry_type == 'polyline') {
    dataset2 = makePolylineBuffer(lyr, dataset, opts);
  } else if (lyr.geometry_type == 'polygon') {
    dataset2 = makePolygonBuffer(lyr, dataset, opts);
  } else {
    stop("Unsupported geometry type");
  }

  return mergeOutputLayersIntoDataset(lyr, dataset, dataset2, opts);
}

