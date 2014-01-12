/* @require mapshaper-common */

MapShaper.printInfo = function(layers, arcData, opts, info) {
  var str = Utils.format("Input: %s (%s)\n",
      opts.input_files.join(', '), opts.input_format);
  str += "Bounds: " + arcData.getBounds().toArray().join(', ') + "\n";
  str += Utils.format("Topological arcs: %'d\n", arcData.size());

  if (!Utils.isInteger(info.intersections_remaining)) {
    info.intersections_remaining = MapShaper.findSegmentIntersections(arcData).length;
  }
  str += Utils.format("Line intersections: %'d\n", info.intersections_remaining);
  if (layers.length > 1) str += '\n';
  str += Utils.map(layers, MapShaper.getLayerInfo).join('\n');
  console.log(str);
};

// TODO: consider polygons with zero area or other invalid geometries
//
MapShaper.countNullShapes = function(shapes) {
  var count = 0;
  for (var i=0; i<shapes.length; i++) {
    if (!shapes[i] || shapes[i].length === 0) count++;
  }
  return count;
};

MapShaper.getLayerInfo = function(lyr) {
  var obj = {};
  obj.fields = lyr.data ? lyr.data.getFields() : null;
  obj.name = lyr.name || null;
  obj.geometry_type = lyr.geometry_type;
  obj.record_count = lyr.shapes.length;
  obj.null_geom_count = MapShaper.countNullShapes(lyr.shapes);
  if (obj.fields) {
    obj.fields.sort();
    obj.sample_values = Utils.map(obj.fields, function(fname) {
      return lyr.data.getRecords()[0][fname];
    });
  }
  return MapShaper.formatLayerInfo(obj);
};

MapShaper.formatSampleData = function(arr) {
  var strings = Utils.map(arr, String),
      digits = Utils.map(strings, function(str, i) {
        return Utils.isNumber(arr[i]) ? (str + '.').indexOf('.') + 1 :  0;
      }),
      maxDigits = Math.max.apply(null, digits),
      col = Utils.map(strings, function(str, i) {
        if (Utils.isNumber(arr[i])) {
          str = Utils.lpad("", 1 + maxDigits - digits[i], ' ') + str;
        } else {
          str = "'" + str + "'";
        }
        return str;
      });
  return col;
};

MapShaper.formatLayerInfo = function(obj) {
  var nameStr = obj.name ? "Layer name: " + obj.name : "Unnamed layer",
      countStr = Utils.format("Records: %'d (with null geometry: %'d)",
          obj.record_count, obj.null_geom_count),
      typeStr = "Geometry: " + obj.geometry_type,
      dataStr;
  if (obj.fields && obj.fields.length > 0) {
    var col1 = Utils.merge(['Field'], obj.fields),
        col2 = Utils.merge(['First value'], MapShaper.formatSampleData(obj.sample_values)),
        padding = Utils.reduce(obj.fields, function(len, fname) {
          return Math.max(len, fname.length);
        }, 5),
        fieldStr = Utils.repeat(col1.length, function(i) {
          return '  ' + Utils.rpad(col1[i], padding, ' ') + "  " + String(col2[i]);
        }).join('\n');
    dataStr = 'Data table:\n' + fieldStr;
  } else {
    dataStr = "Missing attribute data";
  }

  var formatted = "";
  if (obj.name) formatted += "Layer name: " + obj.name + "\n";
  formatted += Utils.format("%s\n%s\n%s\n", typeStr, countStr, dataStr);
  return formatted;
};
