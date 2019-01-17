/* @require mapshaper-projections */

internal.importMetadata = function(dataset, obj) {
  if (obj.proj4) {
    dataset.info.crs = internal.getCRS(obj.proj4);
  }
};

internal.exportMetadata = function(dataset) {
  var crs = internal.getDatasetCRS(dataset);
  var proj4 = null;
  if (crs) {
    proj4 = internal.crsToProj4(crs);
  }
  return {
    proj4: proj4
  };
};
