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
    if (!SVG.isSupportedSvgStyleProperty(svgName)) {
      return;
    }
    var strVal = opts[optName].trim();
    var accessor = internal.getSymbolPropertyAccessor(strVal, svgName, lyr);
    internal.getLayerDataTable(lyr).getRecords().forEach(function(rec, i) {
      if (filter && !filter(i)) {
        // make sure field exists if record is excluded by filter
        if (svgName in rec === false) {
          rec[svgName] = undefined;
        }
      } else {
        rec[svgName] = accessor(i);
      }
    });
  });
};
