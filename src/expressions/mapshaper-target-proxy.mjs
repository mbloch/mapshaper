import { getLayerInfo } from '../commands/mapshaper-info';
import { exportLayerAsGeoJSON } from '../geojson/geojson-export';
import { addGetters } from '../expressions/mapshaper-expression-utils';
// import { importGeoJSON } from '../geojson/geojson-import';

export function getTargetProxy(target) {
  var lyr = target.layers[0];
  var data = getLayerInfo(lyr, target.dataset); // layer_name, feature_count etc
  data.layer = lyr;
  data.dataset = target.dataset;
  addGetters(data, {
    // export as an object, not a string or buffer
    geojson: getGeoJSON
  });

  function getGeoJSON() {
    var features = exportLayerAsGeoJSON(lyr, target.dataset, {rfc7946: true}, true);
    return {
      type: 'FeatureCollection',
      features: features
    };
  }

  return data;
}
