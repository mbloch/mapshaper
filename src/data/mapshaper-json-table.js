/* @requires mapshaper-data-table */

MapShaper.importJSONTable = function(arr) {
  return {
    layers: [{
      data: new DataTable(arr)
    }],
    info: {}
  };
};

MapShaper.exportJSON = function(dataset, opts) {
  return dataset.layers.reduce(function(arr, lyr) {
    if (lyr.data){
      arr.push({
        content: MapShaper.exportJSONTable(lyr),
        filename: (lyr.name || 'output') + '.json'
      });
    }
    return arr;
  }, []);
};

MapShaper.exportJSONTable = function(lyr) {
  return JSON.stringify(lyr.data.getRecords());
};
