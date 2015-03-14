/* @require mapshaper-common, mapshaper-dataset-utils */

api.printInfo = function(dataset, opts) {
  // str += utils.format("Number of layers: %d\n", dataset.layers.length);
  // if (dataset.arcs) str += utils.format("Topological arcs: %'d\n", dataset.arcs.size());
  var str = dataset.layers.map(function(lyr) {
    return MapShaper.getLayerInfo(lyr, dataset.arcs);
  }).join('\n\n');
  message(str);
};

// TODO: consider polygons with zero area or other invalid geometries
MapShaper.countNullShapes = function(shapes) {
  var count = 0;
  for (var i=0; i<shapes.length; i++) {
    if (!shapes[i] || shapes[i].length === 0) count++;
  }
  return count;
};

MapShaper.getLayerInfo = function(lyr, arcs) {
  var shapeCount = lyr.shapes ? lyr.shapes.length : 0,
      nullCount = shapeCount > 0 ? MapShaper.countNullShapes(lyr.shapes) : 0,
      tableSize = lyr.data ? lyr.data.size() : 0,
      str;
  str = "Layer: " + (lyr.name || "[unnamed]") + "\n";
  str += "Geometry: " + (lyr.geometry_type || "[none]") + "\n";
  str += utils.format("Records: %,d\n", Math.max(shapeCount, tableSize));
  if (nullCount > 0) {
    str += utils.format("Null shapes: %'d\n", nullCount);
  }
  if (shapeCount > nullCount) {
    str += "Bounds: " + MapShaper.getLayerBounds(lyr, arcs).toArray().join(' ') + "\n";
  }
  if (tableSize > 0 && lyr.data.getFields().length > 0) {
    str += MapShaper.getTableInfo(lyr.data);
  } else {
    str += "Missing attribute data";
  }
  return str;
};

MapShaper.getTableInfo = function(data) {
  var fields = data.getFields().sort();
  var replacements = {
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t'
  };
  var cleanChar = function(c) {
    // convert newlines and carriage returns
    // TODO: better handling of non-printing chars
    return c in replacements ? replacements[c] : '';
  };
  var col1Chars = fields.reduce(function(memo, name) {
    return Math.max(memo, name.length);
  }, 5) + 2;
  var vals = fields.map(function(fname) {
    return data.getRecords()[0][fname];
  });
  var digits = vals.map(function(val, i) {
    return utils.isNumber(vals[i]) ? (val + '.').indexOf('.') + 1 :  0;
  });
  var maxDigits = Math.max.apply(null, digits);
  var table = vals.map(function(val, i) {
    var str = '  ' + utils.rpad(fields[i], col1Chars, ' ');
    if (utils.isNumber(val)) {
      str += utils.lpad("", maxDigits - digits[i], ' ') + val;
    } else if (utils.isString(val)) {
      val = val.replace(/[\r\t\n]/g, cleanChar);
      str += "'" + val + "'";
    } else {
      str += String(val);
    }
    return str;
  }).join('\n');
  return "Data table\n  " +
      utils.rpad('Field', col1Chars, ' ') + "First value\n" + table;
};
