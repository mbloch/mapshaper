
import { exportLayerAsGeoJSON } from '../geojson/geojson-export';
import { importGeoJSON } from '../geojson/geojson-import';
import { copyLayer } from '../dataset/mapshaper-layer-utils';
import utils from '../utils/mapshaper-utils';
import GeoJSON from '../geojson/geojson-common';

export function expressionUsesGeoJSON(exp) {
  return exp.includes('this.geojson');
}

export function getFeatureEditor(lyr, dataset) {
  var api = {};
  // need to copy attribute to avoid circular references if geojson is assigned
  // to a data property.
  var copy = copyLayer(lyr);
  var features = exportLayerAsGeoJSON(copy, dataset, {rfc7946: true}, true);
  var features2 = [];

  api.get = function(i) {
    if (i > 0) features[i-1] = null; // garbage-collect old features
    return features[i];
  };

  api.set = function(feat, i) {
    var arr;

    if (utils.isString(feat)) {
      feat = JSON.parse(feat);
    }

    if (!feat) return;

    if (feat.type == 'GeometryCollection') {
      arr = feat.geometries.map(geom => GeoJSON.toFeature(geom));
    } else if (feat.type == 'FeatureCollection') {
      arr = feat.features;
    } else {
      feat = GeoJSON.toFeature(feat);
    }

    if (arr) {
      features2 = features2.concat(arr);
    } else {
      features2.push(feat);
    }
  };

  api.done = function() {
    if (features2.length === 0) return; // read-only expression
    var geojson = {
      type: 'FeatureCollection',
      features: features2
    };
    return importGeoJSON(geojson);
  };
  return api;
}
