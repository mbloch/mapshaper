import { getLayerInfo } from '../commands/mapshaper-info';
import { exportLayerAsGeoJSON } from '../geojson/geojson-export';
import { addGetters } from '../expressions/mapshaper-expression-utils';
// import { importGeoJSON } from '../geojson/geojson-import';

export function getTargetProxy(target) {
  var proxy = getLayerInfo(target.layer, target.dataset); // layer_name, feature_count etc
  proxy.layer = target.layer;
  proxy.dataset = target.dataset;
  addGetters(proxy, {
    // export as an object, not a string or buffer
    geojson: getGeoJSON
  });

  function getGeoJSON() {
    var features = exportLayerAsGeoJSON(target.layer, target.dataset, {rfc7946: true}, true);
    return {
      type: 'FeatureCollection',
      features: features
    };
  }

  return proxy;
}
