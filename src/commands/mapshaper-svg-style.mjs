import { getLayerDataTable, getFeatureCount } from '../dataset/mapshaper-layer-utils';
import {
  getSymbolPropertyAccessor,
  labelPositionDerivedFields,
  labelPositionFields,
  parseLabelPosition
} from '../svg/svg-properties';
import { shapeIsPathLabel } from '../svg/svg-label-paths';
import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { initDataTable } from '../dataset/mapshaper-layer-utils';
import { isSupportedSvgStyleProperty, emptyValueUnsetsProperty } from '../svg/svg-properties';
import { combineFilters, getIdFilter } from './mapshaper-filter';
import { iconNames, isSupportedIconName } from '../svg/svg-icons';
import { stop, warn } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';

cmd.svgStyle = function(lyr, dataset, opts) {
  var filterFn, table, fields, hasNewFields, optFields, clearedByPosition, fieldsBefore;

  function hadField(field) {
    return field in fieldsBefore;
  }

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
  optFields = getOptionFields(opts);
  fields = getStyleFields(optFields);
  // Which of dx/dy/text-anchor a label-pos in this command clears: not the ones
  // the same command also sets, so that `label-pos=n dx=3` keeps the nudge it
  // was given instead of clearing it a moment later.
  //
  // Clearing at all is what keeps the shorthand usable, since a value on the
  // record wins over the position: without it, setting a position on a label
  // that had been dragged would appear to do nothing.
  clearedByPosition = labelPositionDerivedFields.filter(function(field) {
    return optFields.indexOf(field) == -1;
  });
  hasNewFields = fields.some(function(field) {
    return !table.fieldExists(field);
  });
  // The table's columns as this command found them. Taken once, because the
  // command adds to them as it runs, and a blanked property must be judged
  // against what was there before rather than against what it has just made.
  fieldsBefore = utils.arrayToIndex(table.getFields());
  if (fields.length > 0) {
    if (hasNewFields) {
      table.captureSchemaBefore({operation: 'style', fields: fields});
    } else {
      table.captureFieldsBefore(fields, {operation: 'style'});
    }
  }
  Object.keys(opts).forEach(function(optName) {
    // undo cli parser name conversion; the regex must be global, or a
    // property with more than one hyphen (e.g. label-start-offset) is silently
    // skipped rather than applied
    var svgName = optName.replace(/_/g, '-');
    if (!isSupportedSvgStyleProperty(svgName)) {
      return;
    }
    var strVal = opts[optName].trim();
    // An empty value removes the property, rather than being rejected as an
    // unparseable one. This is how a control gives a property back: a label
    // dragged off its position clears label-pos, and there is otherwise no
    // per-property unset -- only -style clear, which clears all of them.
    var unset = strVal === '' && emptyValueUnsetsProperty(svgName);
    var accessor = unset ? null : getSymbolPropertyAccessor(strVal, svgName, lyr);
    var badIcons = svgName == 'icon' ? [] : null;
    // Removing a position is not setting one, so it neither validates the
    // value nor clears the offsets the position would have stood for.
    var posOnPaths = svgName == 'label-pos' && !unset ? [] : null;
    table.getRecords().forEach(function(rec, i) {
      if (filterFn && !filterFn(i)) {
        // make sure field exists if record is excluded by filter
        setUndefinedFields(rec, [svgName]);
        if (svgName == 'label-pos') {
          // ...but a field the position would only have cleared is one this
          // command is not writing anywhere, so an excluded record has nothing
          // to stay consistent with
          setUndefinedFields(rec, labelPositionDerivedFields, {has: hadField});
        }
      } else if (unset) {
        // Nothing to remove, and so nothing to create: removing a property no
        // record has would otherwise add an empty column for it.
        if (hadField(svgName) || svgName in rec) rec[svgName] = undefined;
      } else {
        rec[svgName] = accessor(i);
        if (badIcons) {
          addUnsupportedIconName(badIcons, rec.icon);
        }
        if (posOnPaths) {
          if (!parseLabelPosition(rec['label-pos'])) {
            stop('Unexpected value for label-pos:', rec['label-pos']);
          }
          if (shapeIsPathLabel(lyr.shapes && lyr.shapes[i], rec)) {
            // Not stored, so that ignoring it means ignoring it: a stored
            // position would show up in the style panel and would start
            // applying if the label ever lost all but one of its knots. Its
            // text-anchor is left alone too -- that one does place text along a
            // path, so a position that had no effect must not clear it.
            posOnPaths.push(i);
            rec['label-pos'] = undefined;
          } else {
            setUndefinedFields(rec, clearedByPosition, {overwrite: true, has: hadField});
          }
        }
      }
    });
    if (badIcons && badIcons.length > 0) {
      warn(formatUnsupportedIconMessage(badIcons));
    }
    if (posOnPaths && posOnPaths.length > 0) {
      warn(formatPositionOnPathMessage(posOnPaths));
    }
  });
  if (fields.length > 0) {
    if (hasNewFields) {
      table.markSchemaChanged({operation: 'style'});
    } else {
      table.markFieldsChanged(fields, {operation: 'style'});
    }
  }
};

// The style properties this command was given, in SVG spelling.
function getOptionFields(opts) {
  var fields = [];
  Object.keys(opts).forEach(function(optName) {
    var svgName = optName.replace(/_/g, '-');
    if (isSupportedSvgStyleProperty(svgName)) addField(fields, svgName);
  });
  return fields;
}

// The fields the command will write, which is what the undo capture covers.
// label-pos reaches dx/dy/text-anchor as well -- it no longer stores values in
// them, but it does clear them.
function getStyleFields(optFields) {
  var fields = [];
  optFields.forEach(function(svgName) {
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

// Icon names can not be validated when options are parsed, because an icon=
// value may be a field name or an expression. The assigned values are checked
// instead, so that computed names are covered too. Unsupported names are a
// warning, not an error -- features with an unsupported name render without an
// icon.
var maxReportedIconNames = 4;

function addUnsupportedIconName(names, val) {
  var name;
  if (!val) return; // a blank value removes the icon
  name = String(val);
  if (isSupportedIconName(name) || names.indexOf(name) > -1) return;
  names.push(name);
}

function formatUnsupportedIconMessage(names) {
  var extra = names.length - maxReportedIconNames;
  var listed = extra > 0 ? names.slice(0, maxReportedIconNames) : names;
  var str = 'Unsupported icon ' + (names.length > 1 ? 'names' : 'name') + ': ' +
    listed.join(', ');
  if (extra > 0) {
    str += ' (and ' + extra + ' more)';
  }
  return str + '. Expected one of: ' + iconNames.join(', ');
}

// Adds @fields to @rec with no value, so that a record the filter excluded
// still has the same schema as the ones it kept. With overwrite, also blanks a
// value already there -- which is how setting a position takes back the offsets
// a label was carrying.
//
// @has: optional test for whether the layer carries a field at all. A field
// nobody has is not created in order to be blanked: -style label-pos=n clears
// dx, dy and text-anchor because a value on the record wins over the position,
// and there is nothing to win with when the column does not exist. Without
// this, clicking a position in the style panel put three empty columns in the
// user's table, and three empty columns in their CSV.
function setUndefinedFields(rec, fields, opts) {
  var overwrite = !!(opts && opts.overwrite);
  var has = opts && opts.has;
  fields.forEach(function(field) {
    if (has && !has(field) && field in rec === false) return;
    if (overwrite || field in rec === false) {
      rec[field] = undefined;
    }
  });
}

// label-pos places text around an anchor point, which a label strung along a
// path does not have: its text runs from a start offset in the direction the
// path goes. A warning rather than an error, because a layer can hold both
// kinds of label and styling all of it at once is reasonable.
function formatPositionOnPathMessage(ids) {
  var extra = ids.length - maxReportedIds;
  var listed = (extra > 0 ? ids.slice(0, maxReportedIds) : ids).join(', ');
  return 'Ignoring label-pos on ' + ids.length + ' path ' +
    (ids.length > 1 ? 'labels' : 'label') + ' (' + listed +
    (extra > 0 ? ' and ' + extra + ' more' : '') + '). ' +
    'Use label-start-offset= and text-anchor= to place text along a path.';
}

var maxReportedIds = 4;


