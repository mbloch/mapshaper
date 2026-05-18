import { getLayerDataTable, getFeatureCount } from '../dataset/mapshaper-layer-utils';
import {
  getSymbolPropertyAccessor,
  labelPositionFields,
  setLabelPositionStyle
} from '../svg/svg-properties';
import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { initDataTable } from '../dataset/mapshaper-layer-utils';
import { isSupportedSvgStyleProperty } from '../svg/svg-properties';
import { combineFilters, getIdFilter } from './mapshaper-filter';
import { stop } from '../utils/mapshaper-logging';
import cmd from '../mapshaper-cmd';

cmd.svgStyle = function(lyr, dataset, opts) {
  var filterFn, table, fields, hasNewFields;
  if (getFeatureCount(lyr) === 0) {
    return;
  }
  if (!lyr.data) {
    initDataTable(lyr);
  }
  if (opts.where) {
    filterFn = compileFeatureExpression(opts.where, lyr, dataset.arcs);
  }
  if (opts.ids) {
    filterFn = combineFilters(filterFn, getIdFilter(opts.ids));
  }
  if (opts.clear) {
    lyr.data.getFields().filter(isSupportedSvgStyleProperty).forEach(lyr.data.deleteField, lyr.data);
  }
  table = getLayerDataTable(lyr);
  fields = getStyleFields(opts);
  hasNewFields = fields.some(function(field) {
    return !table.fieldExists(field);
  });
  if (fields.length > 0) {
    if (hasNewFields) {
      table.captureSchemaBefore({operation: 'style', fields: fields});
    } else {
      table.captureFieldsBefore(fields, {operation: 'style'});
    }
  }
  Object.keys(opts).forEach(function(optName) {
    var svgName = optName.replace('_', '-'); // undo cli parser name conversion
    if (!isSupportedSvgStyleProperty(svgName)) {
      return;
    }
    var strVal = opts[optName].trim();
    var accessor = getSymbolPropertyAccessor(strVal, svgName, lyr);
    table.getRecords().forEach(function(rec, i) {
      if (filterFn && !filterFn(i)) {
        // make sure field exists if record is excluded by filter
        setUndefinedFields(rec, svgName == 'label-pos' ? labelPositionFields : [svgName]);
      } else {
        rec[svgName] = accessor(i);
        if (svgName == 'label-pos') {
          if (!setLabelPositionStyle(rec, rec['label-pos'])) {
            stop('Unexpected value for label-pos:', rec['label-pos']);
          }
        }
      }
    });
  });
  if (fields.length > 0) {
    if (hasNewFields) {
      table.markSchemaChanged({operation: 'style'});
    } else {
      table.markFieldsChanged(fields, {operation: 'style'});
    }
  }
};

function getStyleFields(opts) {
  var fields = [];
  Object.keys(opts).forEach(function(optName) {
    var svgName = optName.replace('_', '-');
    if (!isSupportedSvgStyleProperty(svgName)) return;
    addField(fields, svgName);
    if (svgName == 'label-pos') {
      labelPositionFields.forEach(function(field) {
        addField(fields, field);
      });
    }
  });
  return fields;
}

function addField(fields, field) {
  if (fields.indexOf(field) == -1) {
    fields.push(field);
  }
}

function setUndefinedFields(rec, fields) {
  fields.forEach(function(field) {
    if (field in rec === false) {
      rec[field] = undefined;
    }
  });
}


