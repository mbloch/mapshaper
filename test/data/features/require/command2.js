
module.exports = function(api) {
  var options = [{
    name: 'x'
  }, {
    name: 'y'
  }];
  var cmd = {
    name: 'make-points',
    options,
    command: run,
    target: 'layer'
  };

  return cmd;

  // modifies layer in place
  function run(lyr, dataset, opts) {
    var features = lyr.data.getRecords().map(function(d) {
      return {
        type: 'Feature',
        properties: d,
        geometry: {
          type: 'Point',
          coordinates: [d[opts.x], d[opts.y]]
        }
      };
    });
    var dataset2 = api.internal.importGeoJSON({type: 'FeatureCollection', features});
    var lyr2 = dataset2.layers[0];
    lyr2.name = lyr.name;
    api.internal.mergeDatasetInfo(dataset2, dataset);
    return {
      dataset: dataset2,
      layers: [lyr2]
    };
  }
};

