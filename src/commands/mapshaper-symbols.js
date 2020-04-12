import cmd from '../mapshaper-cmd';
import { getLayerDataTable } from '../dataset/mapshaper-layer-utils';
import { compileValueExpression } from '../expressions/mapshaper-expressions';
import { getSymbolDataAccessor } from '../svg/svg-properties';
import { requirePointLayer } from '../dataset/mapshaper-layer-utils';
import { stop } from '../utils/mapshaper-logging';
import { symbolBuilders } from '../svg/svg-common';
import '../svg/mapshaper-svg-arrows';

// TODO: refactor to remove duplication in mapshaper-svg-style.js
cmd.symbols = function(lyr, opts) {
  var f, filter;
  // console.log("-symbols opts", opts)
  requirePointLayer(lyr);
  f = getSymbolDataAccessor(lyr, opts);
  if (opts.where) {
    filter = compileValueExpression(opts.where, lyr, null);
  }
  getLayerDataTable(lyr).getRecords().forEach(function(rec, i) {
    if (filter && filter(i)) {
      if ('svg-symbol' in rec === false) {
        rec['svg-symbol'] = undefined;
      }
    } else {
      rec['svg-symbol'] = buildSymbol(f(i));
    }
  });
};

// Returns an svg-symbol data object for one symbol
export function buildSymbol(properties) {
  var type = properties.type;
  var f = symbolBuilders[type];
  if (!type) {
    stop('Missing required "type" parameter');
  } else if (!f) {
    stop('Unknown symbol type:', type);
  }
  return f(properties);
}
