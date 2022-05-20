import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';

cmd.target = function(catalog, opts) {
  var type = (opts.type || '').toLowerCase().replace('linestring', 'polyline');
  var pattern = opts.target || '*';
  var targets = catalog.findCommandTargets(pattern, type);
  if (type && 'polygon,polyline,point'.split(',').indexOf(type) == -1) {
    stop("Invalid layer type:", opts.type);
  }
  if (targets.length === 0) {
    stop("No layers were matched (pattern: " + pattern + (type ? ' type: ' + type : '') + ")");
  }
  if (opts.name || opts.name === '') {
    // TODO: improve this
    targets[0].layers[0].name = opts.name;
  }
  catalog.setDefaultTargets(targets);
};
