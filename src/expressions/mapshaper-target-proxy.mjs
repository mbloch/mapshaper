import { getLayerInfo } from '../commands/mapshaper-info';
import { exportLayerAsGeoJSON } from '../geojson/geojson-export';
import { expandCommandTargets } from '../dataset/mapshaper-target-utils';
import { importGeoJSON } from '../geojson/geojson-import';
import { replaceLayerContents } from '../dataset/mapshaper-dataset-utils';

export function addTargetProxies(targets, ctx) {
  if (targets && targets.length > 0) {
    var proxies = expandCommandTargets(targets).reduce(function(memo, target) {
      var proxy = getTargetProxy(target);
      memo.push(proxy);
      // index targets by layer name too
      if (target.layer.name) {
        memo[target.layer.name] = proxy;
      }
      return memo;
    }, []);
    Object.defineProperty(ctx, 'targets', {value: proxies});
    if (proxies.length == 1) {
      Object.defineProperty(ctx, 'target', {value: proxies[0]});
    }
  }
}

export function getTargetProxy(target) {
  var proxy = getLayerInfo(target.layer, target.dataset); // layer_name, feature_count etc
  proxy.layer = target.layer;
  proxy.dataset = target.dataset;

  Object.defineProperty(proxy, 'geojson', {
    set: setGeoJSON,
    get: getGeoJSON
  });

  function setGeoJSON(o) {
    var dataset2 = importGeoJSON(o);
    var lyr2 = dataset2.layers[0];
    lyr2.name = target.layer.name;
    replaceLayerContents(target.layer, target.dataset, dataset2);
  }

  function getGeoJSON() {
    var features = exportLayerAsGeoJSON(target.layer, target.dataset, {rfc7946: true}, true);
    return {
      type: 'FeatureCollection',
      features: features
    };
  }

  return proxy;
}
