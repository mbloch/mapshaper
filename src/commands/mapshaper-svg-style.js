/* @requires mapshaper-dataset-utils */

api.svgStyle = function(lyr, dataset, opts) {
  var keys = Object.keys(opts),
      svgFields = internal.getStyleFields(keys, internal.svgStyles, internal.invalidSvgTypes[lyr.geometry_type]);

  svgFields.forEach(function(f) {
    var val = opts[f];
    var literal = null;
    var records, func;
    var type = internal.svgStyleTypes[f];
    if (!lyr.data) {
      internal.initDataTable(lyr);
    }
    if (type == 'number' && internal.isSvgNumber(val)) {
      literal = Number(val);
    } else if (type == 'color' && internal.isSvgColor(val, lyr.data.getFields())) {
      literal = val;
    } else if (type == 'classname' && internal.isSvgClassName(val, lyr.data.getFields())) {
      literal = val;
    }
    if (literal === null) {
      func = internal.compileValueExpression(val, lyr, dataset.arcs, {context: internal.defs});
    }
    records = lyr.data.getRecords();
    records.forEach(function(rec, i) {
      rec[f] = func ? func(i) : literal;
    });
  });
};

internal.isSvgClassName = function(str, fields) {
  str = str.trim();
  return (!fields || fields.indexOf(str) == -1) && /^( ?[_a-z][-_a-z0-9]*\b)+$/i.test(str);
};

internal.isSvgNumber = function(o) {
  return utils.isFiniteNumber(o) || utils.isString(o) && /^-?[.0-9]+$/.test(o);
};

internal.isSvgColor = function(str, fields) {
  str = str.trim();
  return (!fields || fields.indexOf(str) == -1) && /^[a-z]+$/i.test(str) ||
    /^#[0-9a-f]+$/i.test(str) || /^rgba?\([0-9,. ]+\)$/.test(str);
};

internal.getStyleFields = function(fields, index, blacklist) {
  return fields.reduce(function(memo, f) {
    if (f in index) {
      if (!blacklist || blacklist.indexOf(f) == -1) {
        memo.push(f);
      }
    }
    return memo;
  }, []);
};

internal.getSvgStyleFields = function(lyr) {
  var fields = lyr.data ? lyr.data.getFields() : [];
  return internal.getStyleFields(fields, internal.svgStyles, internal.invalidSvgTypes[lyr.geometry_type]);
};

// check if layer should be displayed with styles
internal.layerHasSvgDisplayStyle = function(lyr) {
  var fields = internal.getSvgStyleFields(lyr);
  if (lyr.geometry_type == 'point') {
    return fields.indexOf('r') > -1; // require 'r' field for point symbols
  }
  return utils.difference(fields, ['opacity', 'class']).length > 0;
};

internal.invalidSvgTypes = {
  polygon: ['r'],
  polyline: ['r', 'fill']
};

internal.svgStyles = {
  'class': 'class',
  opacity: 'opacity',
  r: 'radius',
  fill: 'fillColor',
  stroke: 'strokeColor',
  stroke_width: 'strokeWidth'
};

internal.svgStyleTypes = {
  class: 'classname',
  opacity: 'number',
  r: 'number',
  fill: 'color',
  stroke: 'color',
  stroke_width: 'number'
};
