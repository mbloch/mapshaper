/* @requires
mapshaper-common
mapshaper-dataset-utils
mapshaper-nodes
mapshaper-projections
*/

api.printInfo = function(dataset, opts) {
  // str += utils.format("Number of layers: %d\n", dataset.layers.length);
  // if (dataset.arcs) str += utils.format("Topological arcs: %'d\n", dataset.arcs.size());
  var str = dataset.layers.map(function(lyr, i) {
    var infoStr = MapShaper.getLayerInfo(lyr, dataset);
    if (dataset.layers.length > 1) {
      infoStr = 'Layer ' + (i + 1) + '\n' + infoStr;
    }
    return infoStr;
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

MapShaper.getLayerInfo = function(lyr, dataset) {
  var str = "Layer name: " + (lyr.name || "[unnamed]") + "\n";
  str += utils.format("Records: %,d\n", MapShaper.getFeatureCount(lyr));
  str += MapShaper.getGeometryInfo(lyr, dataset);
  str += MapShaper.getTableInfo(lyr);
  return str;
};

MapShaper.getGeometryInfo = function(lyr, dataset) {
  var shapeCount = lyr.shapes ? lyr.shapes.length : 0,
      nullCount = shapeCount > 0 ? MapShaper.countNullShapes(lyr.shapes) : 0,
      lines;
  if (!lyr.geometry_type) {
    lines = ["Geometry: [none]"];
  } else {
    lines = ["Geometry", "Type: " + lyr.geometry_type];
    if (nullCount > 0) {
      lines.push(utils.format("Null shapes: %'d", nullCount));
    }
    if (shapeCount > nullCount) {
      lines.push("Bounds: " + MapShaper.getLayerBounds(lyr, dataset.arcs).toArray().join(' '));
      lines.push("Proj.4: " + MapShaper.getProjInfo(dataset));
    }
  }
  return lines.join('\n  ') + '\n';
};

MapShaper.getTableInfo = function(lyr, i) {
  if (!lyr.data || lyr.data.size() === 0) {
    return "Attribute data: [none]";
  }
  return MapShaper.getAttributeInfo(lyr.data, i);
};

MapShaper.getAttributeInfo = function(data, i) {
  var featureId = i || 0;
  var featureLabel = i >= 0 ? 'Value' : 'First value';
  var fields = data.getFields().sort();
  var col1Chars = fields.reduce(function(memo, name) {
    return Math.max(memo, name.length);
  }, 5) + 2;
  var vals = fields.map(function(fname) {
    return data.getRecordAt(featureId)[fname];
  });
  var maxIntegralChars = vals.reduce(function(max, val) {
    if (utils.isNumber(val)) {
      max = Math.max(max, MapShaper.countIntegralChars(val));
    }
    return max;
  }, 0);
  var table = vals.map(function(val, i) {
    return '  ' + MapShaper.formatTableItem(fields[i], val, col1Chars, maxIntegralChars);
  }).join('\n');
  return "Attribute data\n  " +
      utils.rpad('Field', col1Chars, ' ') + featureLabel + "\n" + table;
};

MapShaper.formatNumber = function(val) {
  return val + '';
};

MapShaper.formatString = function(str) {
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

MapShaper.countIntegralChars = function(val) {
  return utils.isNumber(val) ? (MapShaper.formatNumber(val) + '.').indexOf('.') : 0;
};

MapShaper.formatTableItem = function(name, val, col1Chars, integralChars) {
  var str = utils.rpad(name, col1Chars, ' ');
  if (utils.isNumber(val)) {
    str += utils.lpad("", integralChars - MapShaper.countIntegralChars(val), ' ') +
      MapShaper.formatNumber(val);
  } else if (utils.isString(val)) {
    str += MapShaper.formatString(val);
  } else if (utils.isObject(val)) { // if {} or [], display JSON
    str += JSON.stringify(val);
  } else {
    str += String(val);
  }
  return str;
};

MapShaper.getSimplificationInfo = function(arcs) {
  var nodeCount = new NodeCollection(arcs).size();
  // get count of non-node vertices
  var internalVertexCount = MapShaper.countInteriorVertices(arcs);
};

MapShaper.countInteriorVertices = function(arcs) {
  var count = 0;
  arcs.forEach2(function(i, n) {
    if (n > 2) {
      count += n - 2;
    }
  });
  return count;
};
