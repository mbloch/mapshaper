import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { error } from '../utils/mapshaper-logging';

// Get a copy of a layer containing a subset of the layer's features,
// given a "where" expression in the options object
export function getLayerSelection(lyr, arcs, opts) {
  var lyr2 = utils.extend({}, lyr);
  var filterOpts = {
        expression: opts.where,
        invert: !!opts.invert,
        verbose: false,   // don't print status message
        no_replace: opts.no_replace // copy features if original features will be retained
      };
  return cmd.filterFeatures(lyr2, arcs, filterOpts);
}

// Used to run -dissolve with the where= option; could be generalized to support
// other commands
export function applyCommandToLayerSelection(commandFunc, lyr, arcs, opts) {
  if (!opts || !opts.where) {
    error('Missing required "where" parameter');
  }
  var subsetLyr = getLayerSelection(lyr, arcs, opts);
  var cmdOpts = utils.defaults({where: null}, opts); // prevent infinite recursion
  var outputLyr = commandFunc(subsetLyr, arcs, cmdOpts);
  var filterOpts = utils.defaults({invert: true}, opts);
  var filteredLyr = getLayerSelection(lyr, arcs, filterOpts);
  var merged = cmd.mergeLayers([filteredLyr, outputLyr], {verbose: false, force: true});
  return merged[0];
}
