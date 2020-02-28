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
  var records = lyr.data.getRecords();
  var fields = internal.findFieldNames(records, opts.field_order);
  // exporting utf8 and ascii text as string by default (for now)
  var exportAsString = internal.encodingIsUtf8(encoding) && !opts.to_buffer &&
      (records.length < 10000 || opts.to_string);
  if (exportAsString) {
    return internal.exportRecordsAsString(fields, records, delim);
  } else {
    return internal.exportRecordsAsBuffer(fields, records, delim, encoding);
  }
};

internal.exportRecordsAsString = function(fields, records, delim) {
  var formatRow = internal.getDelimRowFormatter(fields, delim);
  var header = internal.formatDelimHeader(fields, delim);
  if (!records.length) return header;
  return header + '\n' + records.map(formatRow).join('\n');
};

internal.exportRecordsAsBuffer = function(fields, records, delim, encoding) {
  var formatRow = internal.getDelimRowFormatter(fields, delim);
  var str = internal.formatDelimHeader(fields, delim);
  var buffers = [internal.encodeString(str, encoding)];
  var tmp = [];
  var n = records.length;
  var i = 0;
  while (i < n) {
    tmp.push(formatRow(records[i]));
    i++;
    if (i % 1000 === 0 || i == n) {
      str = '\n' + tmp.join('\n');
      tmp = [];
      buffers.push(internal.encodeString(str, encoding));
    }
  }
  return Buffer.concat(buffers);
};

internal.formatDelimHeader = function(fields, delim) {
  var formatValue = internal.getDelimValueFormatter(delim);
  return fields.map(formatValue).join(delim);
};

internal.getDelimRowFormatter = function(fields, delim) {
  var formatValue = internal.getDelimValueFormatter(delim);
  return function(rec) {
    return fields.map(function(f) {
      return formatValue(rec[f]);
    }).join(delim);
  };
};

internal.getDelimValueFormatter = function(delim) {
  var dquoteRxp =  new RegExp('["\n\r' + delim + ']');
  function formatString(s) {
    if (dquoteRxp.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }
  return function(val) {
    var s;
    if (val == null) {
      s = '';
    } else if (utils.isString(val)) {
      s = formatString(val);
    } else if (utils.isNumber(val)) {
      s = val + '';
    } else if (utils.isObject(val)) {
      s = formatString(JSON.stringify(val));
    } else {
      s = val + '';
    }
    return s;
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
