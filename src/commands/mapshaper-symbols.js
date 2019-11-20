
/* @requires mapshaper-svg-arrows, mapshaper-data-utils */

// TODO: refactor to remove duplication in mapshaper-svg-style.js
api.symbols = function(lyr, opts) {
  var f, filter;
  // console.log("-symbols opts", opts)
  internal.requirePointLayer(lyr);
  f = internal.getSymbolDataAccessor(lyr, opts);
  if (opts.where) {
    filter = internal.compileValueExpression(opts.where, lyr, null);
  }
  internal.getLayerDataTable(lyr).getRecords().forEach(function(rec, i) {
    if (filter && filter(i)) {
      if ('svg-symbol' in rec === false) {
        rec['svg-symbol'] = undefined;
      }
    } else {
      rec['svg-symbol'] = internal.buildSymbol(f(i));
    }
  });
};

// Returns an svg-symbol data object for one symbol
internal.buildSymbol = function(properties) {
  var type = properties.type;
  var f = SVG.symbolBuilders[type];
  if (!type) {
    stop('Missing required "type" parameter');
  } else if (!f) {
    stop('Unknown symbol type:', type);
  }
  return f(properties);
};
