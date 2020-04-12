import { getLayerDataTable } from '../dataset/mapshaper-layer-utils';
import { getSymbolPropertyAccessor } from '../svg/svg-properties';
import { compileValueExpression } from '../expressions/mapshaper-expressions';
import { initDataTable } from '../dataset/mapshaper-layer-utils';
import { isSupportedSvgStyleProperty } from '../svg/svg-properties';
import cmd from '../mapshaper-cmd';

cmd.svgStyle = function(lyr, dataset, opts) {
  var filter;
  if (!lyr.data) {
    initDataTable(lyr);
  }
  if (opts.where) {
    filter = compileValueExpression(opts.where, lyr, dataset.arcs);
  }
  Object.keys(opts).forEach(function(optName) {
    var svgName = optName.replace('_', '-'); // undo cli parser name conversion
    if (!isSupportedSvgStyleProperty(svgName)) {
      return;
    }
    var strVal = opts[optName].trim();
    var accessor = getSymbolPropertyAccessor(strVal, svgName, lyr);
    getLayerDataTable(lyr).getRecords().forEach(function(rec, i) {
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
