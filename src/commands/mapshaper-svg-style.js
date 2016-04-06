/* @requires mapshaper-dataset-utils */

api.svgStyle = function(lyr, dataset, opts) {
  var keys = Object.keys(opts),
      svgFields = MapShaper.getStyleFields(keys, MapShaper.svgStyles, MapShaper.invalidSvgTypes[lyr.geometry_type]);

  svgFields.forEach(function(f) {
    var val = opts[f];
    var literal = null;
    var records, func;
    var type = MapShaper.svgStyleTypes[f];
    if (!lyr.data) {
      MapShaper.initDataTable(lyr);
    }
    if (type == 'number' && MapShaper.isSvgNumber(val)) {
      literal = Number(val);
    } else if (type == 'color' && MapShaper.isSvgColor(val, lyr.data.getFields())) {
      literal = val;
    } else if (type == 'classname' && MapShaper.isSvgClassName(val, lyr.data.getFields())) {
      literal = val;
    }
    if (literal === null) {
      func = MapShaper.compileValueExpression(val, lyr, dataset.arcs);
    }

    records = lyr.data.getRecords();
    records.forEach(function(rec, i) {
      rec[f] = func ? func(i) : literal;
    });
  });
};

MapShaper.isSvgClassName = function(str, fields) {
  str = str.trim();
  return (!fields || fields.indexOf(str) == -1) && /^( ?[_a-z][-_a-z0-9]*\b)+$/i.test(str);
};

MapShaper.isSvgNumber = function(o) {
  return utils.isFiniteNumber(o) || utils.isString(o) && /^-?[.0-9]+$/.test(o);
};

MapShaper.isSvgColor = function(str, fields) {
  str = str.trim();
  return (!fields || fields.indexOf(str) == -1) && /^[a-z]+$/i.test(str) ||
    /^#[0-9a-f]+$/i.test(str) || /^rgba?\([0-9,. ]+\)$/.test(str);
};

MapShaper.getStyleFields = function(fields, index, blacklist) {
  return fields.reduce(function(memo, f) {
    if (f in index) {
      if (!blacklist || blacklist.indexOf(f) == -1) {
        memo.push(f);
      }
    }
    return memo;
  }, []);
};

MapShaper.getSvgStyleFields = function(lyr) {
  var fields = lyr.data ? lyr.data.getFields() : [];
  return MapShaper.getStyleFields(fields, MapShaper.svgStyles, MapShaper.invalidSvgTypes[lyr.geometry_type]);
};

MapShaper.layerHasSvgDisplayStyle = function(lyr) {
  var fields = MapShaper.getSvgStyleFields(lyr);
  return utils.difference(fields, ['opacity', 'class']).length > 0;
};

MapShaper.invalidSvgTypes = {
  polygon: ['r'],
  polyline: ['r', 'fill']
};

MapShaper.svgStyles = {
  'class': 'class',
  opacity: 'opacity',
  r: 'radius',
  fill: 'fillColor',
  stroke: 'strokeColor',
  stroke_width: 'strokeWidth'
};

MapShaper.svgStyleTypes = {
  class: 'classname',
  opacity: 'number',
  r: 'number',
  fill: 'color',
  stroke: 'color',
  stroke_width: 'number'
};
