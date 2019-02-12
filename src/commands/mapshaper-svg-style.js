/* @requires mapshaper-dataset-utils svg-properties */

api.svgStyle = function(lyr, dataset, opts) {
  var filter;
  if (!lyr.data) {
    internal.initDataTable(lyr);
  }
  if (opts.where) {
    filter = internal.compileValueExpression(opts.where, lyr, dataset.arcs);
  }
  Object.keys(opts).forEach(function(optName) {
    var svgName = optName.replace('_', '-'); // undo cli parser name conversion
    var strVal, literalVal, func, dataType;
    if (!SVG.isSupportedSvgStyleProperty(svgName)) {
      return;
    }
    dataType = SVG.stylePropertyTypes[svgName];
    strVal = opts[optName].trim();
    literalVal = internal.parseSvgLiteralValue(strVal, dataType, lyr.data.getFields());
    if (literalVal === null) {
      // if value was not parsed as a literal, assume it is a JS expression
      func = internal.compileValueExpression(strVal, lyr, dataset.arcs, {context: internal.getStateVar('defs')});
    }
    internal.getLayerDataTable(lyr).getRecords().forEach(function(rec, i) {
      if (filter && !filter(i)) {
        // make sure field exists if record is excluded by filter
        if (svgName in rec === false) {
          rec[svgName] = undefined;
        }
      } else {
        rec[svgName] = func ? func(i) : literalVal;
      }
    });
  });
};
