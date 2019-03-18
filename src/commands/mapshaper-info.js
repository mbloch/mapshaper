/* @requires
mapshaper-common
mapshaper-dataset-utils
mapshaper-nodes
mapshaper-projections
*/

internal.printInfo = function(layers, targetLayers) {
  var str = '';
  layers.forEach(function(o, i) {
    var isTarget = Array.isArray(targetLayers) && targetLayers.indexOf(o.layer) > -1;
    var targStr = isTarget ? ' *' : '';
    str += '\n';
    str += utils.lpad('', 25, '-') + '\n';
    str += 'Layer ' + (i + 1) + targStr + '\n';
    str += utils.lpad('', 25, '-') + '\n';
    str += internal.getLayerInfo(o.layer, o.dataset);
  });
  message(str);
};

internal.getLayerData = function(lyr, dataset) {
  var n = internal.getFeatureCount(lyr);
  var o = {
    geometry_type: lyr.geometry_type,
    feature_count: n,
    null_shape_count: 0,
    null_data_count: lyr.data ? internal.countNullRecords(lyr.data.getRecords()) : n
  };
  if (lyr.shapes) {
    o.null_shape_count = internal.countNullShapes(lyr.shapes);
    o.bbox =internal.getLayerBounds(lyr, dataset.arcs).toArray();
    o.proj4 = internal.getProjInfo(dataset);
  }
  return o;
};

// TODO: consider polygons with zero area or other invalid geometries
internal.countNullShapes = function(shapes) {
  var count = 0;
  for (var i=0; i<shapes.length; i++) {
    if (!shapes[i] || shapes[i].length === 0) count++;
  }
  return count;
};

internal.countNullRecords = function(records) {
  var count = 0;
  for (var i=0; i<records.length; i++) {
    if (!records[i]) count++;
  }
  return count;
};

internal.countRings = function(shapes, arcs) {
  var holes = 0, rings = 0;
  internal.editShapes(shapes, function(ids) {
    var area = geom.getPlanarPathArea(ids, arcs);
    if (area > 0) rings++;
    if (area < 0) holes++;
  });
  return {rings: rings, holes: holes};
};

internal.getLayerInfo = function(lyr, dataset) {
  var data = internal.getLayerData(lyr, dataset);
  var str = "Name:     " + (lyr.name || "[unnamed]") + "\n";
  str += "Type:     " + (data.geometry_type || "tabular data") + "\n";
  str += utils.format("Records:  %,d\n",data.feature_count);
  if (data.null_shape_count > 0) {
    str += utils.format("Nulls:     %'d", data.null_shape_count) + "\n";
  }
  if (data.geometry_type && data.feature_count > data.null_shape_count) {
    str += "Bounds:   " + data.bbox.join(',') + "\n";
    str += "CRS:      " + data.proj4 + "\n";
  }
  str += internal.getAttributeTableInfo(lyr);
  return str;
};

internal.getAttributeTableInfo = function(lyr, i) {
  if (!lyr.data || lyr.data.size() === 0 || lyr.data.getFields().length === 0) {
    return "Attribute data: [none]\n";
  }
  return "\nAttribute data\n" + internal.formatAttributeTable(lyr.data, i);
};

internal.formatAttributeTable = function(data, i) {
  var fields = internal.applyFieldOrder(data.getFields(), 'ascending');
  var vals = fields.map(function(fname) {
    return data.getReadOnlyRecordAt(i || 0)[fname];
  });
  var maxIntegralChars = vals.reduce(function(max, val) {
    if (utils.isNumber(val)) {
      max = Math.max(max, internal.countIntegralChars(val));
    }
    return max;
  }, 0);
  var col1Arr = ['Field'].concat(fields);
  var col2Arr = vals.reduce(function(memo, val) {
    memo.push(internal.formatTableValue(val, maxIntegralChars));
    return memo;
  }, [i >= 0 ? 'Value' : 'First value']);
  var col1Chars = internal.maxChars(col1Arr);
  var col2Chars = internal.maxChars(col2Arr);
  var sepLine = utils.rpad('', col1Chars + 2, '-') + '+' +
      utils.rpad('', col2Chars + 2, '-') + '\n';
  var table = sepLine;
  col1Arr.forEach(function(col1, i) {
    table += ' ' + utils.rpad(col1, col1Chars, ' ') + ' | ' +
      col2Arr[i] + '\n';
    if (i === 0) table += sepLine; // separator after first line
  });
  return table + sepLine;
};

internal.getTableBorder = function(col1, col2) {
  return utils.rpad('', col1 + 2, '-') + '+' + utils.rpad('', col2 + 2, '-');
};

internal.formatNumber = function(val) {
  return val + '';
};

internal.maxChars = function(arr) {
  return arr.reduce(function(memo, str) {
    return str.length > memo ? str.length : memo;
  }, 0);
};

internal.formatString = function(str) {
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
  str = str.replace(/[\r\t\n]/g, cleanChar);
  return "'" + str + "'";
};

internal.countIntegralChars = function(val) {
  return utils.isNumber(val) ? (internal.formatNumber(val) + '.').indexOf('.') : 0;
};

internal.formatTableValue = function(val, integralChars) {
  var str;
  if (utils.isNumber(val)) {
    str = utils.lpad("", integralChars - internal.countIntegralChars(val), ' ') +
      internal.formatNumber(val);
  } else if (utils.isString(val)) {
    str = internal.formatString(val);
  } else if (utils.isObject(val)) { // if {} or [], display JSON
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }
  return str;
};

internal.getSimplificationInfo = function(arcs) {
  var nodeCount = new NodeCollection(arcs).size();
  // get count of non-node vertices
  var internalVertexCount = internal.countInteriorVertices(arcs);
};

internal.countInteriorVertices = function(arcs) {
  var count = 0;
  arcs.forEach2(function(i, n) {
    if (n > 2) {
      count += n - 2;
    }
  });
  return count;
};
