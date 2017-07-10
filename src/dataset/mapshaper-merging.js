/* @requires mapshaper-common */

// Don't modify input layers (mergeDatasets() updates arc ids in-place)
internal.mergeDatasetsForExport = function(arr) {
  // copy layers but not arcs, which get copied in mergeDatasets()
  var copy = arr.map(function(dataset) {
    return utils.defaults({
      layers: dataset.layers.map(internal.copyLayerShapes)
    }, dataset);
  });
  return internal.mergeDatasets(copy);
};

internal.mergeDatasets = function(arr) {
  var arcSources = [],
      arcCount = 0,
      mergedLayers = [],
      mergedInfo = {},
      mergedIsLatLng = null,
      mergedArcs;

  arr.forEach(function(dataset) {
    var bounds = internal.getDatasetBounds(dataset);
    var n = dataset.arcs ? dataset.arcs.size() : 0;
    var isLatLng;
    if (n > 0) {
      arcSources.push(dataset.arcs);
    }
    // check for incompatible CRS
    if (bounds.hasBounds()) {
      isLatLng = internal.probablyDecimalDegreeBounds(bounds);
      if (mergedIsLatLng === null) {
        mergedIsLatLng = isLatLng;
      } else if (mergedIsLatLng !== isLatLng) {
        // TODO: consider stricter CRS rules
        stop("Unable to combine projected and unprojected datasets");
      }
    }
    internal.mergeDatasetInfo(mergedInfo, dataset);
    dataset.layers.forEach(function(lyr) {
      if (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') {
        internal.forEachArcId(lyr.shapes, function(id) {
          return id < 0 ? id - arcCount : id + arcCount;
        });
      }
      mergedLayers.push(lyr);
    });
    arcCount += n;
  });

  mergedArcs = internal.mergeArcs(arcSources);
  if (mergedArcs.size() != arcCount) {
    error("[mergeDatasets()] Arc indexing error");
  }

  return {
    info: mergedInfo,
    arcs: mergedArcs,
    layers: mergedLayers
  };
};

internal.mergeDatasetInfo = function(merged, dataset) {
  var info = dataset.info || {};
  merged.input_files = utils.uniq((merged.input_files || []).concat(info.input_files || []));
  merged.input_formats = utils.uniq((merged.input_formats || []).concat(info.input_formats || []));
  // merge other info properties (e.g. input_geojson_crs, input_delimiter, prj, crs)
  utils.defaults(merged, info);
};

internal.mergeArcs = function(arr) {
  var dataArr = arr.map(function(arcs) {
    if (arcs.getRetainedInterval() > 0) {
      verbose("Baking-in simplification setting.");
      arcs.flatten();
    }
    return arcs.getVertexData();
  });
  var xx = utils.mergeArrays(utils.pluck(dataArr, 'xx'), Float64Array),
      yy = utils.mergeArrays(utils.pluck(dataArr, 'yy'), Float64Array),
      nn = utils.mergeArrays(utils.pluck(dataArr, 'nn'), Int32Array);

  return new ArcCollection(nn, xx, yy);
};

utils.countElements = function(arrays) {
  return arrays.reduce(function(memo, arr) {
    return memo + (arr.length || 0);
  }, 0);
};

utils.mergeArrays = function(arrays, TypedArr) {
  var size = utils.countElements(arrays),
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
};
