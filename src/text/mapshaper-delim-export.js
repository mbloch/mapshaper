/* @requires mapshaper-data-table, mapshaper-data-utils */

// Generate output content from a dataset object
internal.exportDelim = function(dataset, opts) {
  var delim = internal.getExportDelimiter(dataset.info, opts),
      ext = internal.getDelimFileExtension(delim, opts);
  return dataset.layers.reduce(function(arr, lyr) {
    if (lyr.data){
      arr.push({
        // TODO: consider supporting encoding= option
        content: internal.exportDelimTable(lyr, delim, opts.encoding),
        filename: (lyr.name || 'output') + '.' + ext
      });
    }
    return arr;
  }, []);
};

/* default d3 formatting doesn't serialize objects
internal.exportDelimTable = function(lyr, delim) {
  var dsv = require("d3-dsv").dsvFormat(delim);
  return dsv.format(lyr.data.getRecords());
};
*/

internal.exportDelimTable = function(lyr, delim, encoding) {
  var dsv = require("d3-dsv").dsvFormat(delim);
  var fields = lyr.data.getFields();
  var formatRow = internal.getDelimRowFormatter(fields, lyr.data);
  var records = lyr.data.getRecords();
  var str = dsv.formatRows([fields]); // headers
  var tmp = [];
  var n = records.length;
  var i = 0;
  // Formatting rows in groups avoids a memory allocation error that occured when
  // generating a file containing 2.8 million rows.
  while (i < n) {
    tmp.push(formatRow(records[i]));
    i++;
    if (i % 50 === 0 || i == n) {
      str += '\n' + dsv.formatRows(tmp);
      tmp = [];
    }
  }
  // exporting utf8 as a string, temporarily, until tests are rewritten
  // (it will be encoded as utf-8 when written to a file)
  //
  if (!internal.encodingIsUtf8(encoding)) {
    return internal.encodeString(str, encoding);
  }
  return str;
};

// Return a function for converting a record into an array of values
// to pass to dsv.formatRows()
internal.getDelimRowFormatter = function(fields, data) {
  var formatters = fields.map(function(f) {
    var type = internal.getColumnType(f, data);
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
