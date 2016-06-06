/* @requires mapshaper-data-table, mapshaper-data-utils */

// Generate output content from a dataset object
MapShaper.exportDelim = function(dataset, opts) {
  var delim = MapShaper.getExportDelimiter(dataset.info, opts),
      ext = MapShaper.getDelimFileExtension(delim, opts);
  return dataset.layers.reduce(function(arr, lyr) {
    if (lyr.data){
      arr.push({
        // TODO: consider supporting encoding= option
        content: MapShaper.exportDelimTable(lyr, delim),
        filename: (lyr.name || 'output') + '.' + ext
      });
    }
    return arr;
  }, []);
};

/* default d3 formatting doesn't serialize objects
MapShaper.exportDelimTable = function(lyr, delim) {
  var dsv = require("d3-dsv").dsvFormat(delim);
  return dsv.format(lyr.data.getRecords());
};
*/

MapShaper.exportDelimTable = function(lyr, delim) {
  var dsv = require("d3-dsv").dsvFormat(delim);
  var fields = lyr.data.getFields();
  var formatRow = MapShaper.getDelimRowFormatter(fields, lyr.data);
  var records = lyr.data.getRecords();
  var str = dsv.formatRows([fields]); // headers
  // don't copy all data elements
  // str += dsv.formatRows(records.map(formatRow));
  for (var i=0, n=records.length; i<n; i++) {
    str += '\n' + dsv.formatRows([formatRow(records[i])]);
  }
  return str;
};

// Return a function for converting a record into an array of values
// to pass to dsv.formatRows()
MapShaper.getDelimRowFormatter = function(fields, data) {
  var formatters = fields.map(function(f) {
    var type = MapShaper.getColumnType(f, data);
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

MapShaper.getExportDelimiter = function(info, opts) {
  var delim = ','; // default
  var outputExt = opts.output_file ? utils.getFileExtension(opts.output_file) : '';
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
MapShaper.getDelimFileExtension = function(delim, opts) {
  var ext = 'txt'; // default
  if (opts.output_file) {
    ext = utils.getFileExtension(opts.output_file);
  } else if (delim == '\t') {
    ext = 'tsv';
  } else if (delim == ',') {
    ext = 'csv';
  }
  return ext;
};
