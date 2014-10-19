/* @requires mapshaper-data-table */

MapShaper.importDataTable = function(fname, opts) {
  var table;
  if (utils.endsWith(fname.toLowerCase(), '.dbf')) {
    table = MapShaper.importDbfTable(fname, opts.encoding);
  } else {
    // assume delimited text file
    // unsupported file types can be detected earlier, during
    // option validation, using filename extensions
    table = MapShaper.importDelimTable(fname);
  }
  return table;
};

// Accept a type hint from a header like "FIPS:string"
// Return standard type name (number|string)
//
MapShaper.validateFieldType = function(str) {
  var type = 'string'; // default type
  if (str.toLowerCase()[0] == 'n') {
    type = 'number';
  }
  return type;
};

// Look for type hints in array of field headers
// return index of field types
// modify @fields to remove type hints
//
MapShaper.parseFieldHeaders = function(fields, index) {
  var parsed = Utils.map(fields, function(raw) {
    var parts, name, type;
    if (raw.indexOf(':') != -1) {
      parts = raw.split(':');
      name = parts[0];
      type = MapShaper.validateFieldType(parts[1]);
    } else if (raw[0] === '+') {
      name = raw.substr(1);
      type = 'number';
    } else {
      name = raw;
    }
    if (type) {
      index[name] = type;
    }
    // TODO: validate field name
    return name;
  });
  return parsed;
};

MapShaper.importDbfTable = function(shpName, encoding) {
  var dbfName = cli.replaceFileExtension(shpName, 'dbf');
  if (!Node.fileExists(dbfName)) {
    stop("File not found:", dbfName);
  }
  return new ShapefileTable(Node.readFile(dbfName), encoding);
};

MapShaper.importDelimTable = function(file) {
  var records, str, msg;
  try {
    str = Node.readFile(file, 'utf-8');
    records = MapShaper.parseDelimString(str);
    if (!records || records.length === 0) {
      throw new Error();
    }
  } catch(e) {
    msg = "Unable to " + (str ? "read" : "parse") + " file: " + file;
    throw new APIError("Unable to read file: " + file);
  }
  return new DataTable(records);
};

MapShaper.parseDelimString = function(str) {
  var dsv = require("./lib/d3/d3-dsv.js").dsv,
      delim = MapShaper.guessDelimiter(str) || ',';
      records = dsv(delim).parse(str);
  return records;
};

MapShaper.guessDelimiter = function(content) {
  var delimiters = ['|', '\t', ','];
  return Utils.find(delimiters, function(delim) {
    var rxp = MapShaper.getDelimiterRxp(delim);
    return rxp.test(content);
  });
};

MapShaper.getDelimiterRxp = function(delim) {
  var rxp = "^[^\\n\\r]+" + Utils.regexEscape(delim);
  return new RegExp(rxp);
};

MapShaper.adjustRecordTypes = function(records, rawFields) {
  if (records.length === 0) return;
  var hintIndex = {},
      fields = rawFields && MapShaper.parseFieldHeaders(rawFields, hintIndex) || [],
      conversionIndex = {};

  Utils.forEach(records[0], function(val, key) {
    if (key in hintIndex === false) {
      if (Utils.isString(val) && utils.stringIsNumeric(val)) {
        conversionIndex[key] = 'number';
      }
    } else if (hintIndex[key] == 'number' && !Utils.isNumber(val)) {
      conversionIndex[key] = 'number';
    } else if (hintIndex[key] == 'string' && !Utils.isString(val)) {
      conversionIndex[key] = 'string';
    }
  });

  MapShaper.convertRecordTypes(records, conversionIndex);
  return fields;
};

utils.stringIsNumeric = function(str) {
  str = utils.cleanNumber(str);
  // Number() accepts empty strings
  // parseFloat() accepts a number followed by other content
  // Using both for stricter check. TODO consider using regex
  return !isNaN(parseFloat(str)) && !isNaN(Number(str));
};

utils.cleanNumber = function(str) {
  return str.replace(/,/g, '');
};

utils.parseNumber = function(str) {
  return Number(utils.cleanNumber(str));
};

MapShaper.convertRecordTypes = function(records, typeIndex) {
  var typedFields = Utils.keys(typeIndex),
      converters = {
        'string': String,
        'number': utils.parseNumber
      },
      transforms = Utils.map(typedFields, function(f) {
        var type = typeIndex[f],
            converter = converters[type];
        return converter;
      });
  if (typedFields.length === 0) return;
  Utils.forEach(records, function(rec) {
    MapShaper.convertRecordData(rec, typedFields, transforms);
  });
};

MapShaper.convertRecordData = function(rec, fields, converters) {
  var f;
  for (var i=0; i<fields.length; i++) {
    f = fields[i];
    rec[f] = converters[i](rec[f]);
  }
};
