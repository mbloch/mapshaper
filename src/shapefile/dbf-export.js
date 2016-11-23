/* @requires
dbf-writer
mapshaper-data-table
*/

MapShaper.exportDbf = function(dataset, opts) {
  return dataset.layers.reduce(function(files, lyr) {
    if (lyr.data) {
      files = files.concat(MapShaper.exportDbfFile(lyr, dataset, opts));
    }
    return files;
  }, []);
};

MapShaper.exportDbfFile = function(lyr, dataset, opts) {
  var data = lyr.data,
      buf;
  // create empty data table if missing a table or table is being cut out
  if (!data || opts.cut_table || opts.drop_table) {
    data = new DataTable(lyr.shapes ? lyr.shapes.length : 0);
  }
  // dbfs should have at least one column; add id field if none
  if (data.getFields().length === 0) {
    data.addIdField();
  }
  buf = data.exportAsDbf(opts.encoding || 'utf8');
  if (utils.isInteger(opts.ldid)) {
    new Uint8Array(buf)[29] = opts.ldid; // set language driver id
  }
  // TODO: also export .cpg page
  return [{
    content: buf,
    filename: lyr.name + '.dbf'
  }];
};
