/* @requires mapshaper-data-table */

MapShaper.exportAsDelim = function(dataset, opts) {
  var delim = opts.delimiter || dataset.info.input_delimiter || ',',
      ext = MapShaper.getDelimFileExtension(delim);
  return dataset.layers.map(function(lyr) {
    return {
      content: MapShaper.exportDelimTable(lyr, delim),
      filename: (lyr.name || 'output') + '.' + ext
    };
  });
};

MapShaper.exportDelimTable = function(lyr, delim) {
  var dsv = require("./lib/d3/d3-dsv.js").dsv(delim);
  return dsv.format(lyr.data.getRecords());
};

MapShaper.getDelimFileExtension = function(delim) {
  var ext = 'txt';
  if (delim == '\t') {
    ext = 'tsv';
  } else if (delim == ',') {
    ext = 'csv';
  }
  return ext;
};

MapShaper.exportAsDbf = function(dataset, opts) {
  return dataset.layers.map(function(lyr) {
    return {
      content: lyr.data.exportAsDbf(opts.encoding),
      filename: (lyr.name || 'output') + '.dbf'
    };
  });
};
