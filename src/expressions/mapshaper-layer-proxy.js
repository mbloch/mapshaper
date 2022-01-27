import { getLayerBounds } from '../dataset/mapshaper-layer-utils';
import { addGetters } from '../expressions/mapshaper-expression-utils';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';

// Returns an object representing a layer in a JS expression
export function getLayerProxy(lyr, arcs) {
  var obj = {};
  var records = lyr.data ? lyr.data.getRecords() : null;
  var getters = {
    name: lyr.name,
    data: records,
    type: lyr.geometry_type,
    size: getFeatureCount(lyr),
    empty: getFeatureCount(lyr) === 0
  };
  addGetters(obj, getters);
  addBBoxGetter(obj, lyr, arcs);
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

export function addBBoxGetter(obj, lyr, arcs) {
  var bbox;
  addGetters(obj, {
    bbox: function() {
      if (!bbox) {
        bbox = getBBox(lyr, arcs);
      }
      return bbox;
    }
  });
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
