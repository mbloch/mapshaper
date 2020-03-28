/* @requires mapshaper-data-table */

internal.importJSONTable = function(arr) {
  internal.fixInconsistentFields(arr);
  return {
    layers: [{
      data: new DataTable(arr)
    }],
    info: {}
  };
};

internal.exportJSON = function(dataset, opts) {
  return dataset.layers.reduce(function(arr, lyr) {
    if (lyr.data){
      arr.push({
        content: internal.exportJSONTable(lyr, opts),
        filename: (lyr.name || 'output') + '.json'
      });
    }
    return arr;
  }, []);
};

internal.exportJSONTable = function(lyr, opts) {
  var stringify = opts && opts.prettify ? internal.getFormattedStringify([]) : JSON.stringify;
  return stringify(lyr.data.getRecords());
};
