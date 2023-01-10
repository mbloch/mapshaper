
import { setDatasetCrsInfo, getCrsInfo, crsToProj4, getDatasetCRS } from '../crs/mapshaper-projections';

export function importMetadata(dataset, obj) {
  if (obj.proj4) {
    setDatasetCrsInfo(dataset, getCrsInfo(obj.proj4));
  }
}

export function exportMetadata(dataset) {
  var crs = getDatasetCRS(dataset);
  var proj4 = null;
  if (crs) {
    proj4 = crsToProj4(crs);
  }
  return {
    proj4: proj4
  };
}
