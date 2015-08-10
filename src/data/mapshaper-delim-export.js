/* @requires mapshaper-data-table */

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

MapShaper.exportDelimTable = function(lyr, delim) {
  var dsv = require("./lib/d3/d3-dsv.js").dsv(delim);
  return dsv.format(lyr.data.getRecords());
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
