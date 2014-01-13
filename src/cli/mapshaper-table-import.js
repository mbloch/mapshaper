/* @requires mapshaper-data-table */

MapShaper.importTableAsync = function(fname, done, opts) {
  if (Utils.endsWith(fname.toLowerCase(), '.dbf')) {
    done(MapShaper.importDbfTable(fname, opts.encoding));
  } else {
    // assume delimited text file
    // unsupported file types can be detected earlier, during
    // option validation, using filename extensions
    MapShaper.importDelimTableAsync(fname, done);
  }
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
  if (!Node.fileExists(dbfName)) return null;
  return new ShapefileTable(Node.readFile(dbfName), encoding);
};

MapShaper.importDelimTableAsync = function(file, done, typeIndex) {
  return MapShaper.importDelimStringAsync(Node.readFile(file, 'utf-8'), done);
};

MapShaper.importDelimStringAsync = function(content, done) {
  var csv = require("csv"),
      delim = MapShaper.guessDelimiter(content),
      opts = {columns: true};
  if (delim) {
    opts.delimiter = delim;
  }
  csv().from.string(content, opts)
      .to.array(function(data) {
        done(new DataTable(data));
      });
};

MapShaper.stringIsNumeric = function(str) {
  str = MapShaper.cleanNumber(str);
  // Number() accepts empty strings
  // parseFloat() accepts a number followed by other content
  // Using both for stricter check. TODO consider using regex
  return !isNaN(parseFloat(str)) && !isNaN(Number(str));
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
      if (Utils.isString(val) && MapShaper.stringIsNumeric(val)) {
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

MapShaper.cleanNumber = function(str) {
  return str.replace(/,/g, '');
};

MapShaper.parseNumber = function(str) {
  return Number(MapShaper.cleanNumber(str));
};

MapShaper.convertRecordTypes = function(records, typeIndex) {
  var typedFields = Utils.keys(typeIndex),
      converters = {
        'string': String,
        'number': MapShaper.parseNumber
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
