import { encodingIsUtf8, encodeString } from '../text/mapshaper-encodings';
import { findFieldNames } from '../datatable/mapshaper-data-utils';
import utils from '../utils/mapshaper-utils';
import { Buffer } from '../utils/mapshaper-node-buffer';
import { getFileExtension } from '../utils/mapshaper-filename-utils';
import { exportRecordsAsFixedWidthString } from './mapshaper-fixed-width';

// Generate output content from a dataset object
export function exportDelim(dataset, opts) {
  var delim = getExportDelimiter(dataset.info, opts),
      ext = getDelimFileExtension(delim, opts);
  return dataset.layers.reduce(function(arr, lyr) {
    if (lyr.data){
      arr.push({
        // TODO: consider supporting encoding= option
        content: exportLayerAsDSV(lyr, delim, opts),
        filename: (lyr.name || 'output') + '.' + ext
      });
    }
    return arr;
  }, []);
}

export function exportLayerAsDSV(lyr, delim, optsArg) {
  var opts = optsArg || {};
  var encoding = opts.encoding || 'utf8';
  var records = lyr.data.getRecords();
  var fields = findFieldNames(records, opts.field_order);
  if (delim == ' ') {
    return exportRecordsAsFixedWidthString(fields, records, opts);
  }
  var formatRow = getDelimRowFormatter(fields, delim, opts);
  // exporting utf8 and ascii text as string by default (for now)
  var exportAsString = encodingIsUtf8(encoding) && !opts.to_buffer &&
      (records.length < 10000 || opts.to_string);
  if (exportAsString) {
    return exportRecordsAsString(fields, records, formatRow);
  } else {
    return exportRecordsAsBuffer(fields, records, formatRow, encoding);
  }
}

function exportRecordsAsString(fields, records, formatRow) {
  var header = formatHeader(fields, formatRow);
  if (!records.length) return header;
  return header + '\n' + records.map(formatRow).join('\n');
}

function exportRecordsAsBuffer(fields, records, formatRow, encoding) {
  var str = formatHeader(fields, formatRow);
  var buffers = [encodeString(str, encoding)];
  var tmp = [];
  var n = records.length;
  var i = 0;
  while (i < n) {
    tmp.push(formatRow(records[i]));
    i++;
    if (i % 1000 === 0 || i == n) {
      str = '\n' + tmp.join('\n');
      tmp = [];
      buffers.push(encodeString(str, encoding));
    }
  }
  return Buffer.concat(buffers);
}

function formatHeader(fields, formatRow) {
  var rec = fields.reduce(function(memo, f) {
    memo[f] = f;
    return memo;
  }, {});
  return formatRow(rec);
}

function getDelimRowFormatter(fields, delim, opts) {
  var formatValue = getDelimValueFormatter(delim, opts);
  return function(rec) {
    return fields.map(function(f) {
      return formatValue(rec[f]);
    }).join(delim);
  };
}

export function getDelimValueFormatter(delim, opts) {
  var dquoteRxp = new RegExp('["\n\r' + delim + ']');
  var decimalComma = opts && opts.decimal_comma || false;
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
      s = decimalComma ? utils.formatIntlNumber(val) : utils.formatNumber(val);
    } else if (utils.isObject(val)) {
      s = formatString(JSON.stringify(val));
    } else {
      s = val + '';
    }
    return s;
  };
}

function getExportDelimiter(info, opts) {
  var delim = ','; // default
  var outputExt = opts.file ? getFileExtension(opts.file) : '';
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
}

// If output filename is not specified, use the delimiter char to pick
// an extension.
function getDelimFileExtension(delim, opts) {
  var ext = 'txt'; // default
  if (opts.file) {
    ext = getFileExtension(opts.file);
  } else if (delim == '\t') {
    ext = 'tsv';
  } else if (delim == ',') {
    ext = 'csv';
  }
  return ext;
}
