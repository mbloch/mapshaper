/* @requires mapshaper-data-table */

MapShaper.importTableAsync = function(fname, done) {
  if (Utils.endsWith(fname.toLowerCase(), '.dbf')) {
    done(MapShaper.importDbfTable(fname));
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

MapShaper.importDbfTable = function(shpName) {
  var dbfName = cli.replaceFileExtension(shpName, 'dbf');
  if (!Node.fileExists(dbfName)) return null;
  return new ShapefileTable(Node.readFile(dbfName));
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

function findNumericFields(obj) {
  var fields = Utils.keys(obj);
  return Utils.filter(fields, function(field) {
    return !isNaN(parseFloat(obj[field]));
  });
}

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
  var typeIndex = {},
      fields = rawFields && MapShaper.parseFieldHeaders(rawFields, typeIndex) || [];

  Utils.forEach(findNumericFields(records[0]), function(f) {
    if (f in typeIndex === false && Utils.contains(fields, f)) {
      typeIndex[f] = 'number';
    }
  });

  MapShaper.updateRecordTypes(records, typeIndex);
  return fields;
};

MapShaper.updateRecordTypes = function(records, typeIndex) {
  var typedFields = Utils.keys(typeIndex),
      converters = {
        'string': String,
        'number': parseFloat
      },
      transforms = Utils.map(typedFields, function(f) {
        var type = typeIndex[f],
            converter = converters[type];
        return converter;
      });
  if (typedFields.length === 0) return;
  Utils.forEach(records, function(rec) {
    MapShaper.convertRecordTypes(rec, typedFields, transforms);
  });
};

MapShaper.convertRecordTypes = function(rec, fields, converters) {
  var f;
  for (var i=0; i<fields.length; i++) {
    f = fields[i];
    rec[f] = converters[i](rec[f]);
  }
};
