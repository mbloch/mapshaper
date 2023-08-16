import api from '../mapshaper-api';
import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import cli from '../cli/mapshaper-cli-utils';
import { CommandParser } from '../cli/mapshaper-command-parser';
import require from '../mapshaper-require';

var externalCommands = {};

cmd.registerCommand = function(name, params) {
  var defn = {name: name, options: params.options || []};
  // Add definitions of options common to all commands (TODO: remove duplication)
  defn.options.push({name: 'target'});
  utils.defaults(defn, params);
  validateExternalCommand(defn);
  externalCommands[name] = defn;
};

export function isValidExternalCommand(defn) {
  try {
    validateExternalCommand(defn);
    return true;
  } catch(e) {}
  return false;
}

function validateExternalCommand(defn) {
  var targetTypes = ['layer', 'layers'];
  if (typeof defn.command != 'function') {
    stop('Expected "command" parameter function');
  }
  if (!defn.target) {
    stop('Missing required "target" parameter');
  }
  if (!targetTypes.includes(defn.target)) {
    stop('Unrecognized command target type:', defn.target);
  }
}

cmd.runExternalCommand = function(cmdOpts, catalog) {
  var name = cmdOpts.name;
  var cmdDefn = externalCommands[name];
  if (!cmdDefn) {
    stop('Unsupported command:', name);
  }
  var targetType = cmdDefn.target;
  var opts = parseExternalCommand(name, cmdDefn, cmdOpts._);
  var targets = catalog.findCommandTargets(opts.target || '*');
  var target = targets[0];
  var output;
  if (!target) {
    stop('Missing a target');
  }
  if (targetType == 'layer' && (target.layers.length != 1 || targets.length > 1)) {
    stop('This command only supports targeting a single layer');
  }
  if (targets.length > 1) {
    stop("Targetting layers from multiple datasets is not supported");
  }
  if (targetType == 'layer') {
    output = cmdDefn.command(target.layers[0], target.dataset, opts.options);
  } else if (targetType == 'layers') {
    output = cmdDefn.command(target.layers, target.dataset, opts.options);
  }
  if (output) {
    integrateOutput(output, target, catalog, opts);
  }
};

// TODO: remove restrictions on output data
function integrateOutput(output, input, catalog, opts) {
  if (!output.dataset || !output.layers || output.layers.length > 0 === false) {
    stop('Invalid command output');
  }
  if (output.dataset == input.dataset) {
    stop('External commands are not currently allowed to modify input datasets');
  }
  if (output.dataset.layers.length != output.layers.length) {
    stop('Currently not supported: targetting a subset of output layers');
  }
  if (!opts.no_replace) {
    input.layers.forEach(function(lyr) {
      catalog.deleteLayer(lyr, input.dataset);
    });
  }
  catalog.addDataset(output.dataset);
}

function parseExternalCommand(name, cmdDefn, tokens) {
  var parser = new CommandParser();
  var cmd = parser.command(name);
  (cmdDefn.options || []).forEach(function(o) {
    cmd.option(o.name, o);
  });
  var parsed = parser.parseArgv(['-' + name].concat(tokens));
  return parsed[0];
}
