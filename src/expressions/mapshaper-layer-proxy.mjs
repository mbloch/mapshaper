import { getLayerBounds, getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { addGetters } from '../expressions/mapshaper-expression-utils';
import { getColumnType } from '../datatable/mapshaper-data-utils';
import { stop, error } from '../utils/mapshaper-logging';
import { countTargetLayers } from '../dataset/mapshaper-target-utils';

export function getNullLayerProxy(targets) {
  var obj = {};
  var n = countTargetLayers(targets);
  var getters = {
    name: error,
    data: error,
    type: error,
    size: error,
    empty: error,
    bbox: error
  };
  addGetters(obj, getters);
  obj.field_exists = error;
  obj.field_type = error;
  obj.field_includes = error;
  return obj;
  function error() {
    throw Error(`This expression requires a single target layer; Received ${n} layers.`);
  }
}



// Returns an object representing a layer in a JS expression
export function getLayerProxy(lyr, arcs) {
  var obj = {};
  var records = lyr.data ? lyr.data.getRecords() : null;
  var getters = {
    name: lyr.name,
    data: records,
    type: lyr.geometry_type,
    size: getFeatureCount(lyr),
    empty: getFeatureCount(lyr) === 0,
    bbox: getBBoxGetter(obj, lyr, arcs)
  };
  addGetters(obj, getters);
  obj.field_exists = function(name) {
    return lyr.data && lyr.data.fieldExists(name) ? true : false;
  };
  obj.field_type = function(name) {
    return lyr.data && getColumnType(name, lyr.data.getRecords()) || null;
  };
  obj.field_includes = function(name, val) {
    if (!lyr.data) return false;
    return lyr.data.getRecords().some(function(rec) {
      return rec && (rec[name] === val);
    });
  };
  return obj;
}

export function addLayerGetters(ctx, lyr, arcs) {
  var layerProxy;
  addGetters(ctx, {
    layer_name: lyr.name || '', // consider removing this
    layer: function() {
      // init on first access (to avoid overhead if not used)
      if (!layerProxy) layerProxy = getLayerProxy(lyr, arcs);
      return layerProxy;
    }
  });
  return ctx;
}

export function getBBoxGetter(obj, lyr, arcs) {
  var bbox;
  return function() {
    if (!bbox) {
      bbox = getBBox(lyr, arcs);
    }
    return bbox;
  };
}

function getBBox(lyr, arcs) {
  var bounds = getLayerBounds(lyr, arcs); // TODO: avoid this overhead if bounds is not used
  if (!bounds) return null;
  var bbox = bounds.toArray();
  Object.assign(bbox, {
    cx: bounds.centerX(),
    cy: bounds.centerY(),
    height: bounds.height(),
    width: bounds.width(),
    left: bounds.xmin,
    bottom: bounds.ymin,
    top: bounds.ymax,
    right: bounds.xmax
  });
  return bbox;
}
