/* @require mapshaper-common */

// Merge similar layers in a dataset, in-place
api.mergeLayers = function(layers) {
  var index = {},
      merged = [];

  // layers with same key can be merged
  function layerKey(lyr) {
    var key = lyr.geometry_type || '';
    if (lyr.data) {
      key += '~' + lyr.data.getFields().sort().join(',');
    }
    return key;
  }

  layers.forEach(function(lyr) {
    var key = layerKey(lyr),
        indexedLyr,
        records;
    if (key in index === false) {
      index[key] = lyr;
      merged.push(lyr);
    } else {
      indexedLyr = index[key];
      indexedLyr.name = utils.mergeNames(indexedLyr.name, lyr.name);
      if (indexedLyr.shapes && lyr.shapes) {
        indexedLyr.shapes = indexedLyr.shapes.concat(lyr.shapes);
      } else {
        indexedLyr.shapes = null;
      }
      if (indexedLyr.data && lyr.data) {
        records = indexedLyr.data.getRecords().concat(lyr.data.getRecords());
        indexedLyr.data = new DataTable(records);
      } else {
        indexedLyr.data = null;
      }
    }
  });

  if (merged.length >= 2) {
    stop("[merge-layers] Unable to merge " + (merged.length < layers.length ? "some " : "") + "layers. Geometry and data fields must be compatible.");
  }

  return merged;
};
