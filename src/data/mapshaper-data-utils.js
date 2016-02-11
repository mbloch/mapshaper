/* @requires mapshaper-common */

MapShaper.deleteFields = function(table, test) {
  table.getFields().forEach(function(name) {
    if (test(name)) {
      table.deleteField(name);
    }
  });
};

MapShaper.isInvalidFieldName = function(f) {
  // Reject empty and all-whitespace strings. TODO: consider other criteria
  return /^\s*$/.test(f);
};
