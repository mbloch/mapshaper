/* @requires mapshaper-data-table, mapshaper-data-utils */

// Generate output content from a dataset object
internal.exportDelim = function(dataset, opts) {
  var delim = internal.getExportDelimiter(dataset.info, opts),
      ext = internal.getDelimFileExtension(delim, opts);
  return dataset.layers.reduce(function(arr, lyr) {
    if (lyr.data){
      arr.push({
        // TODO: consider supporting encoding= option
        content: internal.exportLayerAsDSV(lyr, delim, opts),
        filename: (lyr.name || 'output') + '.' + ext
      });
    }
    return arr;
  }, []);
};

internal.exportLayerAsDSV = function(lyr, delim, optsArg) {
  var opts = optsArg || {};
  var encoding = opts.encoding || 'utf8';
  var formatRows = require("d3-dsv").dsvFormat(delim).formatRows;
  var records = lyr.data.getRecords();
  var fields = internal.findFieldNames(records, opts.field_order);
  // exporting utf8 and ascii text as string by default (for now)
  var exportAsString = internal.encodingIsUtf8(encoding) && !opts.to_buffer &&
      (records.length < 10000 || opts.to_string);
  if (exportAsString) {
    return internal.exportRecordsAsString(fields, records, formatRows);
  } else {
    return internal.exportRecordsAsBuffer(fields, records, formatRows, encoding);
  }
};

internal.exportRecordsAsString = function(fields, records, formatRows) {
  var formatRow = internal.getDelimRowFormatter(fields, records);
  var rows = [fields].concat(records.map(formatRow));
  return formatRows(rows);
};

internal.exportRecordsAsBuffer = function(fields, records, formatRows, encoding) {
  var formatRow = internal.getDelimRowFormatter(fields, records);
  var str = formatRows([fields]); // header
  var buffers = [internal.encodeString(str, encoding)];
  var tmp = [];
  var n = records.length;
  var i = 0;
  while (i < n) {
    tmp.push(formatRow(records[i]));
    i++;
    if (i % 1000 === 0 || i == n) {
      str = '\n' + formatRows(tmp);
      tmp = [];
      buffers.push(internal.encodeString(str, encoding));
    }
  }
  return Buffer.concat(buffers);
};

// Return a function for converting a record into an array of values
// to pass to dsv.formatRows()
internal.getDelimRowFormatter = function(fields, records) {
  var formatters = fields.map(function(f) {
    var type = internal.getColumnType(f, records);
    return function(rec) {
      if (type == 'object') {
        return JSON.stringify(rec[f]);
      }
      return rec[f]; // use default d3-dsv formatting
    };
  });
  return function(rec) {
    var values = [];
    for (var i=0; i<formatters.length; i++) {
      values.push(formatters[i](rec));
    }
    return values;
  };
};

internal.getExportDelimiter = function(info, opts) {
  var delim = ','; // default
  var outputExt = opts.file ? utils.getFileExtension(opts.file) : '';
  if (opts.delimiter) {
    delim = opts.delimiter;
  } else if (outputExt == 'tsv') {
    delim = '\t';
  } else if (outputExt == 'csv') {
    delim = ',';
  } else if (info.input_delimiter) {
    delim = info.input_delimiter;
  }
  return delim;
};

// If output filename is not specified, use the delimiter char to pick
// an extension.
internal.getDelimFileExtension = function(delim, opts) {
  var ext = 'txt'; // default
  if (opts.file) {
    ext = utils.getFileExtension(opts.file);
  } else if (delim == '\t') {
    ext = 'tsv';
  } else if (delim == ',') {
    ext = 'csv';
  }
  return ext;
};
