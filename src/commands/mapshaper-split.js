import { compileValueExpression } from '../expressions/mapshaper-expressions';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { copyLayer } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
// @expression: optional field name or expression
//
cmd.splitLayer = function(src, expression, opts) {
  var lyr0 = opts && opts.no_replace ? copyLayer(src) : src,
      properties = lyr0.data ? lyr0.data.getRecords() : null,
      shapes = lyr0.shapes,
      index = {},
      splitLayers = [],
      namer = getSplitNameFunction(lyr0, expression);

  // if (splitField) {
  //   internal.requireDataField(lyr0, splitField);
  // }

  utils.repeat(getFeatureCount(lyr0), function(i) {
    var name = namer(i),
        lyr;

    if (name in index === false) {
      index[name] = splitLayers.length;
      lyr = {
        geometry_type: lyr0.geometry_type,
        name: name,
        data: properties ? new DataTable() : null,
        shapes: shapes ? [] : null
      };
      splitLayers.push(lyr);
    } else {
      lyr = splitLayers[index[name]];
    }
    if (shapes) {
      lyr.shapes.push(shapes[i]);
    }
    if (properties) {
      lyr.data.getRecords().push(properties[i]);
    }
  });
  return splitLayers;
};

export function getSplitNameFunction(lyr, exp) {
  var compiled;
  if (!exp) {
    // if not splitting on an expression and layer is unnamed, name split-apart layers
    // like: split-1, split-2, ...
    return function(i) {
      return (lyr && lyr.name || 'split') + '-' + (i + 1);
    };
  }
  lyr = {name: lyr.name, data: lyr.data}; // remove shape info
  compiled = compileValueExpression(exp, lyr, null);
  return function(i) {
    var val = compiled(i);
    return String(val);
    // return val || val === 0 ? String(val) : '';
  };
}


// internal.getSplitKey = function(i, field, properties) {
//   var rec = field && properties ? properties[i] : null;
//   return String(rec ? rec[field] : i + 1);
// };

// internal.getSplitLayerName = function(base, key) {
//   return (base ? base + '-' : '') + key;
// };

// internal.getStringInterpolator = function(str) {
//   var body = 'with($$ctx) { return `' + str + '`; }';
//   var f = new Function("$$ctx", body);
//   return function(o) {
//     var s = '';
//     try {
//       s = f(ctx);
//     } catch(e) {
//       stop("Unable to interpolate [" + str + "]");
//     }
//     return s;
//   }
// };
