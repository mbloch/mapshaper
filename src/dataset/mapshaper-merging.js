import { isLatLngCRS, getDatasetCRS } from '../geom/mapshaper-projections';
import { forEachArcId } from '../paths/mapshaper-path-utils';
import { copyLayerShapes } from '../dataset/mapshaper-layer-utils';
import utils from '../utils/mapshaper-utils';
import { verbose, stop, error } from '../utils/mapshaper-logging';
import { ArcCollection } from '../paths/mapshaper-arcs';
import { buildTopology } from '../topology/mapshaper-topology';

export function mergeDatasetsIntoDataset(dataset, datasets) {
  var merged = mergeDatasets([dataset].concat(datasets));
  var mergedLayers = datasets.reduce(function(memo, dataset) {
    return memo.concat(dataset.layers);
  }, []);
  dataset.arcs = merged.arcs;
  return mergedLayers;
}

// Don't modify input layers (mergeDatasets() updates arc ids in-place)
export function mergeDatasetsForExport(arr) {
  // copy layers but not arcs, which get copied in mergeDatasets()
  var copy = arr.map(function(dataset) {
    return utils.defaults({
      layers: dataset.layers.map(copyLayerShapes)
    }, dataset);
  });
  return mergeDatasets(copy);
}

export function mergeCommandTargets(targets, catalog) {
  var targetLayers = [];
  var targetDatasets = [];
  var datasetsWithArcs = 0;
  var merged;

  targets.forEach(function(target) {
    targetLayers = targetLayers.concat(target.layers);
    targetDatasets = targetDatasets.concat(target.dataset);
    if (target.dataset.arcs && target.dataset.arcs.size() > 0) datasetsWithArcs++;
  });

  merged = mergeDatasets(targetDatasets);

  // Rebuild topology, if multiple datasets contain arcs
  if (datasetsWithArcs > 1) {
    buildTopology(merged);
  }

  // remove old datasets after merging, so catalog is not affected if merge throws an error
  targetDatasets.forEach(catalog.removeDataset);
  catalog.addDataset(merged); // sets default target to all layers in merged dataset
  catalog.setDefaultTarget(targetLayers, merged); // reset default target
  return [{
    layers: targetLayers,
    dataset: merged
  }];
}

// Combine multiple datasets into one using concatenation
// (any shared topology is ignored)
export function mergeDatasets(arr) {
  var arcSources = [],
      arcCount = 0,
      mergedLayers = [],
      mergedInfo = {},
      mergedArcs;

  // Error if incompatible CRS
  requireDatasetsHaveCompatibleCRS(arr);

  arr.forEach(function(dataset) {
    var n = dataset.arcs ? dataset.arcs.size() : 0;
    if (n > 0) {
      arcSources.push(dataset.arcs);
    }

    mergeDatasetInfo(mergedInfo, dataset);
    dataset.layers.forEach(function(lyr) {
      if (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') {
        forEachArcId(lyr.shapes, function(id) {
          return id < 0 ? id - arcCount : id + arcCount;
        });
      }
      mergedLayers.push(lyr);
    });
    arcCount += n;
  });

  mergedArcs = mergeArcs(arcSources);
  if (mergedArcs.size() != arcCount) {
    error("[mergeDatasets()] Arc indexing error");
  }

  return {
    info: mergedInfo,
    arcs: mergedArcs,
    layers: mergedLayers
  };
}

function requireDatasetsHaveCompatibleCRS(arr) {
  arr.reduce(function(memo, dataset) {
    var P = getDatasetCRS(dataset);
    if (memo && P) {
      if (isLatLngCRS(memo) != isLatLngCRS(P)) {
        stop("Unable to combine projected and unprojected datasets");
      }
    }
    return P || memo;
  }, null);
}

function mergeDatasetInfo(merged, dataset) {
  var info = dataset.info || {};
  merged.input_files = utils.uniq((merged.input_files || []).concat(info.input_files || []));
  merged.input_formats = utils.uniq((merged.input_formats || []).concat(info.input_formats || []));
  // merge other info properties (e.g. input_geojson_crs, input_delimiter, prj, crs)
  utils.defaults(merged, info);
}

export function mergeArcs(arr) {
  var dataArr = arr.map(function(arcs) {
    if (arcs.getRetainedInterval() > 0) {
      verbose("Baking-in simplification setting.");
      arcs.flatten();
    }
    return arcs.getVertexData();
  });
  var xx = mergeArrays(utils.pluck(dataArr, 'xx'), Float64Array),
      yy = mergeArrays(utils.pluck(dataArr, 'yy'), Float64Array),
      nn = mergeArrays(utils.pluck(dataArr, 'nn'), Int32Array);

  return new ArcCollection(nn, xx, yy);
}

function countElements(arrays) {
  return arrays.reduce(function(memo, arr) {
    return memo + (arr.length || 0);
  }, 0);
}

function mergeArrays(arrays, TypedArr) {
  var size = countElements(arrays),
      Arr = TypedArr || Array,
      merged = new Arr(size),
      offs = 0;
  arrays.forEach(function(src) {
    var n = src.length;
    for (var i = 0; i<n; i++) {
      merged[i + offs] = src[i];
    }
    offs += n;
  });
  return merged;
}
