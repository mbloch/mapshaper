/* @requires mapshaper-dataset-utils svg-common */

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
    var strVal, literalVal, func;
    if (!internal.isSupportedSvgProperty(svgName)) return;
    strVal = opts[optName].trim();
    literalVal = internal.parseSvgValue(svgName, strVal, lyr.data.getFields());
    if (literalVal === null) {
      // if value was not parsed as a literal, assume it is a JS expression
      func = internal.compileValueExpression(strVal, lyr, dataset.arcs, {context: internal.getStateVar('defs')});
    }
    lyr.data.getRecords().forEach(function(rec, i) {
      if (filter && !filter(i)) {
        // make sure field exists if record is excluded by filter
        if (svgName in rec === false) rec[svgName] = undefined;
      } else {
        rec[svgName] = func ? func(i) : literalVal;
      }
    });
  });
};

internal.isSupportedSvgProperty = function(name) {
  return SVG.supportedProperties.indexOf(name) > -1 || name == 'label-text';
};

// returns parsed value or null if @strVal is not recognized as a valid literal value
internal.parseSvgValue = function(name, strVal, fields) {
  var type = SVG.propertyTypes[name];
  var val;
  if (fields.indexOf(strVal) > -1) {
    val = null; // field names are valid expressions
  } else if (type == 'number') {
    // TODO: handle values with units, like "13px"
    val = internal.isSvgNumber(strVal) ? Number(strVal) : null;
  } else if (type == 'color') {
    val = internal.isSvgColor(strVal) ? strVal : null;
  } else if (type == 'classname') {
    val = internal.isSvgClassName(strVal) ? strVal : null;
  } else if (type == 'measure') { // SVG/CSS length (e.g. 12px, 1em, 4)
    val = internal.isSvgMeasure(strVal) ? strVal : null;
  } else {
    // unknown type -- assume string is an expression if JS syntax chars are found
    // (but not chars like <sp> and ',', which may be in a font-family, e.g.)
    val = /[\?\:\[\(\+]/.test(strVal) ? null : strVal; //
  }
  return val;
};

internal.isSvgClassName = function(str) {
  return /^( ?[_a-z][-_a-z0-9]*\b)+$/i.test(str);
};

internal.isSvgNumber = function(o) {
  return utils.isFiniteNumber(o) || utils.isString(o) && /^-?[.0-9]+$/.test(o);
};

internal.isSvgMeasure = function(o) {
  return utils.isFiniteNumber(o) || utils.isString(o) && /^-?[.0-9]+[a-z]*$/.test(o);
};

internal.isSvgColor = function(str) {
  return /^[a-z]+$/i.test(str) ||
    /^#[0-9a-f]+$/i.test(str) || /^rgba?\([0-9,. ]+\)$/.test(str);
};
