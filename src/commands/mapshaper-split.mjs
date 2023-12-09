import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { getFeatureCount, copyLayer } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
// @expression: optional field name or expression
//
cmd.splitLayer = function(src, expression, optsArg) {
  var opts = optsArg || {},
      lyr0 = opts.no_replace ? copyLayer(src) : src,
      properties = lyr0.data ? lyr0.data.getRecords() : null,
      shapes = lyr0.shapes,
      index = {},
      splitLayers = [],
      n = getFeatureCount(lyr0),
      namer;

  if (opts.ids) {
    namer = getIdSplitFunction(opts.ids);
  } else {
    namer = getSplitNameFunction(lyr0, expression);
  }

  // // halt if split field is missing
  // if (splitField) {
  //   internal.requireDataField(lyr0, splitField);
  // }

  // if input layer is empty, return original layer
  // TODO: consider halting
  if (n === 0) {
    return [lyr0];
  }

  utils.repeat(n, function(i) {
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

function getIdSplitFunction(ids) {
  var set = new Set(ids);
  return function(i) {
    return set.has(i) ? '1' : '2';
  };
}

export function getSplitNameFunction(lyr, arg) {
  var compiled;
  if (!arg) {
    // if not splitting on an expression and layer is unnamed, name split-apart layers
    // like: split-1, split-2, ...
    return function(i) {
      return (lyr && lyr.name || 'split') + '-' + (i + 1);
    };
  }
  if (lyr.data && lyr.data.fieldExists(arg)) {
    // Argument is a field name
    return function(i) {
      var rec = lyr.data.getRecords()[i];
      return rec ? valueToLayerName(rec[arg]) : '';
    };
  }
  // Assume: argument is an expression
  lyr = {name: lyr.name, data: lyr.data}; // remove shape info
  compiled = compileFeatureExpression(arg, lyr, null);
  return function(i) {
    var val = compiled(i);
    return valueToLayerName(val);
  };
}

function valueToLayerName(val) {
  return String(val);
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
