import { cleanPathsAfterImport } from '../paths/mapshaper-path-import';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import utils from '../utils/mapshaper-utils';
import { buildTopology } from '../topology/mapshaper-topology';
import cmd from '../mapshaper-cmd';
import { importFile } from '../io/mapshaper-file-import';

// Import multiple files to a single dataset
export function importFiles(files, opts) {
  var unbuiltTopology = false;
  var datasets = files.map(function(fname) {
    // import without topology or snapping
    var importOpts = utils.defaults({no_topology: true, snap: false, snap_interval: null, files: [fname]}, opts);
    var dataset = importFile(fname, importOpts);
    // check if dataset contains non-topological paths
    // TODO: may also need to rebuild topology if multiple topojson files are merged
    if (dataset.arcs && dataset.arcs.size() > 0 && dataset.info.input_formats[0] != 'topojson') {
      unbuiltTopology = true;
    }
    return dataset;
  });
  var combined = mergeDatasets(datasets);
  // Build topology, if needed
  // TODO: consider updating topology of TopoJSON files instead of concatenating arcs
  // (but problem of mismatched coordinates due to quantization in input files.)
  if (unbuiltTopology && !opts.no_topology) {
    cleanPathsAfterImport(combined, opts);
    buildTopology(combined);
  }
  return combined;
}
