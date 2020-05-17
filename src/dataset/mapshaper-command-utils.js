
import { compileValueExpression } from '../expressions/mapshaper-expressions';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { error } from '../utils/mapshaper-logging';


// Get a shallow copy of a layer containing a subset of the layer's features,
// given a "where" expression in the options object
export function getLayerSelection(lyr, arcs, opts) {
  var lyr2 = utils.extend({}, lyr);
  return cmd.filterFeatures(lyr2, arcs, {expression: opts.where, invert: !!opts.invert, verbose: false});
}

export function applyCommandToLayerSelection(commandFunc, lyr, arcs, opts) {
  if (!opts || !opts.where) {
    error('Missing required "where" parameter');
  }
  var filter = compileValueExpression(opts.where, lyr, arcs);
  var subsetLyr = getLayerSelection(lyr, arcs, opts);
  var cmdOpts = utils.defaults({where: null}, opts); // prevent infinite recursion
  var outputLyr = commandFunc(subsetLyr, arcs, cmdOpts);
  var filteredLyr = getLayerSelection(lyr, arcs, {invert: true, where: opts.where});
  var merged = cmd.mergeLayers([filteredLyr, outputLyr], {verbose: false, force: true});
  return merged[0];
}
