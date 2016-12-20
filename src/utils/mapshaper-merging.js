/* @requires mapshaper-common */

// Don't modify input layers (mergeDatasets() updates arc ids in-place)
MapShaper.mergeDatasetsForExport = function(arr) {
  // copy layers but not arcs, which get copied in mergeDatasets()
  var copy = arr.map(function(dataset) {
    return utils.defaults({
      layers: dataset.layers.map(MapShaper.copyLayerShapes)
    }, dataset);
  });
  return MapShaper.mergeDatasets(copy);
};


MapShaper.mergeDatasets = function(arr) {
  var arcSources = [],
      arcCount = 0,
      mergedLayers = [],
      mergedInfo = MapShaper.mergeDatasetInfo(arr),
      mergedArcs;

  arr.forEach(function(data) {
    var n = data.arcs ? data.arcs.size() : 0;
    if (n > 0) {
      arcSources.push(data.arcs);
    }
    data.layers.forEach(function(lyr) {
      if (lyr.geometry_type == 'polygon' || lyr.geometry_type == 'polyline') {
        // reindex arc ids
        MapShaper.forEachArcId(lyr.shapes, function(id) {
          return id < 0 ? id - arcCount : id + arcCount;
        });
      }
      mergedLayers.push(lyr);
    });
    arcCount += n;
  });

  mergedArcs = MapShaper.mergeArcs(arcSources);
  if (mergedArcs.size() != arcCount) {
    error("[mergeDatasets()] Arc indexing error");
  }

  return {
    info: mergedInfo,
    arcs: mergedArcs,
    layers: mergedLayers
  };
};

MapShaper.mergeDatasetInfo = function(arr) {
  // Get crs, prevent incompatible CRSs
  var crs = arr.reduce(function(memo, d) {
    var P = MapShaper.getDatasetProjection(d);
    if (!memo) {
      memo = P;
    } else if (memo && P) {
      if (memo.is_latlong != P.is_latlong) {
        stop("Unable to combine projected and unprojected datasets");
      } else if (memo.is_latlong) {
        // datasets are both unprojected
        // TODO: check for incompatibility
      } else {
        // datasets are both projected
        // TODO: check for incompatibility
      }
    }
    return memo;
  }, null);
  var info = arr.reduce(function(memo, d) {
    var info = d.info || {};
    memo.input_files = memo.input_files.concat(info.input_files || []);
    memo.input_formats = memo.input_formats.concat(info.input_formats || []);
    // merge other info properties (e.g. input_geojson_crs, input_delimiter, input_prj)
    // TODO: check for incompatibilities
    return utils.defaults(memo, info);
  }, {crs: crs, input_formats: [], input_files: []});
  return info;
};

MapShaper.mergeArcs = function(arr) {
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
