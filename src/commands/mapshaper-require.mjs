import cmd from '../mapshaper-cmd';
import { evalTemplateExpression } from '../expressions/mapshaper-template-expressions';
import { stop, getErrorDetail } from '../utils/mapshaper-logging';
import { getStashedVar } from '../mapshaper-stash';
import cli from '../cli/mapshaper-cli-utils';
import require from '../mapshaper-require';
import api from '../mapshaper-api';
import { isValidExternalCommand } from '../commands/mapshaper-external';

cmd.require = async function(opts) {
  var globals = getStashedVar('defs');
  var moduleFile, moduleName, moduleUrl, mod;
  if (!opts.module) {
    stop("Missing module name or path to module");
  }
  if (cli.isFile(opts.module)) {
    moduleFile = opts.module;
  } else if (cli.isFile(opts.module + '.js')) {
    moduleFile = opts.module + '.js';
  } else if (/^https?:\/\//.test(opts.module)) {
    moduleUrl = opts.module;
  } else {
    moduleName = opts.module;
  }
  try {
    if (moduleUrl) {
      // load ES module from URL
      var response = await fetch(moduleUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch module from URL: ${response.status} ${response.statusText}`);
      }
      var moduleBuffer = Buffer.from(await response.text()).toString("base64");
      mod = await import(`data:text/javascript;base64,${moduleBuffer}`);
    } else {
      // import CJS and ES modules
      mod = await import(moduleFile ? require('url').pathToFileURL(moduleFile) : moduleName);
    }
    if (mod.default) {
      mod = mod.default;
    }
    if (typeof mod == 'function') {
      // assuming that functions are mapshaper command generators...
      // this MUST be changed asap.
      var retn = mod(api);
      if (retn && isValidExternalCommand(retn)) {
        cmd.registerCommand(retn.name, retn);
      }
    }
  } catch(e) {
    if (!mod) {
      stop('Unable to load external module:', e.message, getErrorDetail(e));
    }
  }
  if (moduleName || opts.alias) {
    globals[opts.alias || moduleName] = mod;
  } else {
    Object.assign(globals, mod);
  }
  // instead of an init expression, you could use -run <expression>
  // if (opts.init) {
  //   await evalTemplateExpression(opts.init, targets);
  // }
};
