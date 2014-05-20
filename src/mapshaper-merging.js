/* @requires mapshaper-common, mapshaper-merge-layers */

MapShaper.mergeDatasets = function(arr) {
  var arcSources = [],
      arcCount = 0,
      mergedLayers = [],
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
    // info: arr[0].info,
    arcs: mergedArcs,
    layers: mergedLayers
  };
};

MapShaper.mergeArcs = function(arr) {
  var dataArr = arr.map(function(arcs) {
    var data = arcs.getVertexData();
    if (data.zz) {
      error("[mergeArcs()] Merging arcs with z data is not supported");
    }
    return data;
  });

  var xx = utils.mergeArrays(Utils.pluck(dataArr, 'xx'), Float64Array),
      yy = utils.mergeArrays(Utils.pluck(dataArr, 'yy'), Float64Array),
      nn = utils.mergeArrays(Utils.pluck(dataArr, 'nn'), Int32Array);

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
  Utils.forEach(arrays, function(src) {
    var n = src.length;
    for (var i = 0; i<n; i++) {
      merged[i + offs] = src[i];
    }
    offs += n;
  });
  return merged;
};
