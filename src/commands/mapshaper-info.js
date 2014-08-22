/* @require mapshaper-common, mapshaper-dataset-utils */

api.printInfo = function(dataset, opts) {
  // str += Utils.format("Number of layers: %d\n", dataset.layers.length);
  // if (dataset.arcs) str += Utils.format("Topological arcs: %'d\n", dataset.arcs.size());
  var str = dataset.layers.map(function(lyr) {
    return MapShaper.getLayerInfo(lyr, dataset.arcs);
  }).join('\n');
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
  var str = "Layer: " + (lyr.name || "[unnamed]") + "\n";
  str += "Geometry: " + (lyr.geometry_type || "[none]") + "\n";
  if (lyr.shapes) {
    str += Utils.format("Records: %'d (null shapes: %'d)\n",
        lyr.shapes.length, MapShaper.countNullShapes(lyr.shapes));

    str += "Bounds: " + MapShaper.getLayerBounds(lyr, arcs).toArray().join(' ') + "\n";
  }
  if (lyr.data && lyr.data.size() > 0 && lyr.data.getFields().length > 0) {
    str += MapShaper.getTableInfo(lyr.data);
  } else {
    str += "Missing attribute data";
  }
  return str;
};

MapShaper.getTableInfo = function(data) {
  var fields = data.getFields().sort();
  var col1Chars = fields.reduce(function(memo, name) {
    return Math.max(memo, name.length);
  }, 5) + 2;
  var vals = fields.map(function(fname) {
    return data.getRecords()[0][fname];
  });
  var digits = vals.map(function(val, i) {
    return Utils.isNumber(vals[i]) ? (val + '.').indexOf('.') + 1 :  0;
  });
  var maxDigits = Math.max.apply(null, digits);
  var table = vals.map(function(val, i) {
    var str = '  ' + Utils.rpad(fields[i], col1Chars, ' ');
    if (Utils.isNumber(val)) {
      str += Utils.lpad("", maxDigits - digits[i], ' ') + val;
    } else {
      str += "'" + val + "'";
    }
    return str;
  }).join('\n');
  return "Data table\n  " +
      Utils.rpad('Field', col1Chars, ' ') + "First value\n" + table;
};
