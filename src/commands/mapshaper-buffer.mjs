import { mergeDatasetsIntoDataset } from '../dataset/mapshaper-merging';
import { makePolygonBuffer } from '../buffer/mapshaper-polygon-buffer';
import { makePolylineBuffer, makeOffsetLines } from '../buffer/mapshaper-polyline-buffer';
import { makePointBuffer } from '../buffer/mapshaper-point-buffer';
import { setOutputLayerName, copyLayer } from '../dataset/mapshaper-layer-utils';
import {
  mergeOutputLayersIntoDataset,
  copyDatasetInfo
} from '../dataset/mapshaper-dataset-utils';
import {
  getDatasetCRS,
  getDatasetCrsInfo,
  setDatasetCrsInfo,
  getCrsInfo,
  isLatLngCRS,
  isInvertibleCRS
} from '../crs/mapshaper-projections';
import { projectDataset } from './mapshaper-proj';
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
  if (opts.fill_gaps && lyr.geometry_type != 'polygon') {
    stop('The fill-gaps option requires a polygon layer');
  }
  if (opts.geodesic && !isLatLngCRS(getDatasetCRS(dataset))) {
    // Geodesic buffer of projected data: reproject the source paths through
    // WGS84 lng/lat, run the ordinary (spherical) buffer pipeline, then
    // reproject the result back to the source CRS (see buildGeodesicProjectedBufferDataset).
    dataset2 = buildGeodesicProjectedBufferDataset(lyr, dataset, opts);
  } else {
    dataset2 = buildBufferDataset(lyr, dataset, opts);
  }

  return mergeOutputLayersIntoDataset(lyr, dataset, dataset2, opts);
}

function buildBufferDataset(lyr, dataset, opts) {
  if (lyr.geometry_type == 'point') {
    return makePointBuffer(lyr, dataset, opts);
  }
  if (lyr.geometry_type == 'polyline') {
    return makePolylineBuffer(lyr, dataset, opts);
  }
  if (lyr.geometry_type == 'polygon') {
    return makePolygonBuffer(lyr, dataset, opts);
  }
  stop("Unsupported geometry type");
}

// Build a geodesic buffer for a projected dataset by reusing the spherical
// (lat-long) buffer pipeline. The buffer construction already runs in web
// Mercator internally and treats lng/lat input as geodesic, so we only need to
// move the source coordinates into lng/lat and the result back:
//   1. Clone the target layer + arcs and reproject the clone to WGS84 lng/lat.
//      (Reprojecting projected -> lng/lat requires the source CRS to have an
//      inverse; hence the isInvertibleCRS guard. The clone keeps the original
//      dataset untouched and avoids reprojecting unrelated sibling layers.)
//   2. Run the normal buffer on the lng/lat clone -- isLatLngCRS(clone) is true,
//      so the construction selects geodesic offsets automatically.
//   3. Reproject the buffer output back to the source CRS (lng/lat -> projected
//      uses the always-present forward transform). projectDataset's
//      pre-projection clip/clamp handles buffer geometry that exceeds the
//      destination projection's valid extent; any remaining unprojectable
//      vertices are dropped (and counted) by projectArcs2/projectPointLayer.
function buildGeodesicProjectedBufferDataset(lyr, dataset, opts) {
  var srcInfo = getDatasetCrsInfo(dataset);
  if (!srcInfo.crs) {
    stop('Unable to buffer -- source coordinate system is unknown');
  }
  if (!isInvertibleCRS(srcInfo.crs)) {
    stop('The geodesic option requires a source projection with an inverse');
  }
  var wgs84 = getCrsInfo('wgs84');
  var clone = {
    info: copyDatasetInfo(dataset.info),
    arcs: dataset.arcs ? dataset.arcs.getFilteredCopy() : null,
    layers: [copyLayer(lyr)]
  };
  projectDataset(clone, srcInfo.crs, wgs84.crs, {});
  setDatasetCrsInfo(clone, wgs84);
  var dataset2 = buildBufferDataset(clone.layers[0], clone, opts);
  projectDataset(dataset2, wgs84.crs, srcInfo.crs, {});
  setDatasetCrsInfo(dataset2, srcInfo);
  return dataset2;
}

