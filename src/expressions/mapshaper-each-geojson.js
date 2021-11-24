
import { exportGeoJSON, exportLayerAsGeoJSON } from '../geojson/geojson-export';
import { importGeoJSON } from '../geojson/geojson-import';
import { copyLayer } from '../dataset/mapshaper-layer-utils';
import utils from '../utils/mapshaper-utils';
import GeoJSON from '../geojson/geojson-common';

export function expressionUsesGeoJSON(exp) {
  return exp.includes('this.geojson');
}

export function getFeatureEditor(lyr, dataset) {
  var changed = false;
  var api = {};
  // need to copy attribute to avoid circular references if geojson is assigned
  // to a data property.
  var copy = copyLayer(lyr);
  var features = exportLayerAsGeoJSON(copy, dataset, {}, true);

  api.get = function(i) {
    return features[i];
  };

  api.set = function(feat, i) {
    changed = true;
    if (utils.isString(feat)) {
      feat = JSON.parse(feat);
    }
    features[i] = GeoJSON.toFeature(feat); // TODO: validate
  };

  api.done = function() {
    if (!changed) return; // read-only expression
    // TODO: validate number of features, etc.
    var geojson = {
      type: 'FeatureCollection',
      features: features
    };
    // console.log(JSON.stringify(geojson, null, 2))
    return importGeoJSON(geojson);
  };
  return api;
}
