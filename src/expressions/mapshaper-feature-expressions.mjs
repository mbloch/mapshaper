import { addFeatureExpressionUtils, requireBooleanResult } from '../expressions/mapshaper-expression-utils';
import { initFeatureProxy } from '../expressions/mapshaper-feature-proxy';
import { addLayerGetters } from '../expressions/mapshaper-layer-proxy';
import { initDataTable } from '../dataset/mapshaper-layer-utils';
import utils from '../utils/mapshaper-utils';
import { message, stop } from '../utils/mapshaper-logging';
import { getStashedVar } from '../mapshaper-stash';
import { getAssignedVars, getExpressionFunction, getBaseContext, nullifyUnsetProperties}
  from './mapshaper-expressions';

export function compileFeatureExpression(exp, lyr, arcs, optsArg) {
  var opts = optsArg || {},
      vars = getAssignedVars(exp);

  if (vars.length > 0 && !lyr.data) {
    initDataTable(lyr);
  }

  var records = lyr.data ? lyr.data.getRecords() : [];
  var getFeatureById = initFeatureProxy(lyr, arcs, opts);
  var layerOnlyProxy = addLayerGetters({}, lyr, arcs);
  var ctx = getFeatureExpressionContext(lyr, opts.context || {}, opts);
  var func = getExpressionFunction(exp, ctx, opts);

  // recId: index of a data record in the records array.
  // destRec: (optional argument, used by -calc) an object used to capture assignments
  //   By default, assignments are captured by records[recId]
  //
  return function(recId, destRec) {
    var rec = destRec || records[recId] || (records[recId] = {});
    // Assigning feature/layer proxy to '$' ... ctx.$ is also exposed as 'this'
    // in the expression context.
    ctx.$ = recId >= 0 ? getFeatureById(recId) : layerOnlyProxy;
    // Expose data properties using "d", like d3 does. (data propertries are
    // also available as "this.properties")
    ctx.d = rec;

    return func(rec);
  };
}

export function compileFeaturePairFilterExpression(exp, lyr, arcs) {
  var func = compileFeaturePairExpression(exp, lyr, arcs);
  return function(idA, idB) {
    var val = func(idA, idB);
    requireBooleanResult(val, '"where" expression must return true or false');
    return val;
  };
}

export function compileFeaturePairExpression(exp, lyr, arcs) {
  // don't add layer data to the context
  // (fields are not added to the pair expression context)
  var ctx = getFeatureExpressionContext({});
  var getA = getProxyFactory(lyr, arcs);
  var getB = getProxyFactory(lyr, arcs);
  var func = getExpressionFunction(exp, ctx, {});

  function getProxyFactory(lyr, arcs) {
    var records = lyr.data ? lyr.data.getRecords() : [];
    var getFeatureById = initFeatureProxy(lyr, arcs);
    function Proxy() {}

    return function(id) {
      var proxy;
      if (id == -1) return null;
      Proxy.prototype = records[id] || {};
      proxy = new Proxy();
      proxy.$ = getFeatureById(id);
      return proxy;
    };
  }

  // idA - id of a record
  // idB - id of a record, or -1
  // rec - optional data record
  return function(idA, idB, rec) {
    ctx.A = getA(idA);
    ctx.B = getB(idB);
    return func(rec || {});
  };
}



function getFeatureExpressionContext(lyr, mixins, opts) {
  var defs = getStashedVar('defs');
  var env = getBaseContext();
  var ctx = {};
  var fields = lyr.data ? lyr.data.getFields() : [];
  opts = opts || {};
  addFeatureExpressionUtils(env); // mix in round(), sprintf(), etc.
  if (fields.length > 0) {
    // default to null values, so assignments to missing data properties
    // are applied to the data record, not the global object
    nullifyUnsetProperties(fields, env);
  }
  // Add global 'defs' to the expression context
  mixins = utils.defaults(mixins || {}, defs);
  // also add defs as 'global' object
  env.global = defs;
  Object.keys(mixins).forEach(function(key) {
    // Catch name collisions between data fields and user-defined functions
    var d = Object.getOwnPropertyDescriptor(mixins, key);
    if (d.get) {
      // copy accessor function from mixins to context
      Object.defineProperty(ctx, key, {get: d.get}); // copy getter function to context
    } else {
      // copy regular property from mixins to context, but make it non-writable
      Object.defineProperty(ctx, key, {value: mixins[key]});
    }
  });
  // make context properties non-writable, so they can't be replaced by an expression
  return Object.keys(env).reduce(function(memo, key) {
    if (key in memo) {
      // property has already been set (probably by a mixin, above): skip
      // "no_warn" option used in calc= expressions
      if (!opts.no_warn) {
        if (typeof memo[key] == 'function' && fields.indexOf(key) > -1) {
          message('Warning: ' + key + '() function is hiding a data field with the same name');
        } else {
          message('Warning: "' + key + '" has multiple definitions');
        }
      }
    } else {
      Object.defineProperty(memo, key, {value: env[key]}); // writable: false is default
    }
    return memo;
  }, ctx);
}

