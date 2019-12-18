/* @requires mapshaper-path-filters */

internal.getGapFillTest = function(dataset, opts) {
  var test;
  if (opts.min_gap_area === 0) {
    test = function() {return false;}; // don't fill any gaps
  } else if (opts.min_gap_area) {
    test = internal.getMinAreaTest(opts.min_gap_area, dataset);
  } else {
    test = internal.getSliverTest(dataset.arcs); // default is same as -filter-slivers default
  }
  return test;
};


// lyr is a polygon layer before
internal.getGapFillTest2 = function(lyr, dataset, opts) {
  var test;
  if (opts.min_gap_area === 0) {
    test = function() {return false;}; // don't fill any gaps
  } else if (opts.min_gap_area) {
    test = internal.getMinAreaTest(opts.min_gap_area, dataset);
  } else {
    test = internal.getSliverTest2(lyr, dataset.arcs); // default is same as -filter-slivers default
  }
  return test;
};
