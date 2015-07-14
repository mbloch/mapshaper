/* mapshaper-gui-lib */

function ImportFileProxy(model) {
  // Try to match an imported dataset or layer.
  // TODO: think about handling import options
  function find(src) {
    var datasets = model.getDatasets();
    var retn = datasets.reduce(function(memo, d) {
      var lyr;
      if (memo) return memo; // already found a match
      // try to match import filename of this dataset
      if (d.info.input_files[0] == src) return d;
      // try to match name of a layer in this dataset
      lyr = utils.find(d.layers, function(lyr) {return lyr.name == src;});
      return lyr ? MapShaper.isolateLayer(lyr, d) : null;
    }, null);
    if (!retn) stop("Missing data layer [" + src + "]");
    return retn;
  }

  api.importFile = function(src, opts) {
    var dataset = find(src);
    // return a copy with layers duplicated, so changes won't affect original layers
    // TODO: refactor
    return utils.defaults({
      layers: dataset.layers.map(MapShaper.copyLayer)
    }, dataset);
  };

  api.importDataTable = function(src, opts) {
    var dataset = find(src);
    return dataset.layers[0].data;
  };

}
