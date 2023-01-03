// This is the entry point for bundling mapshaper's web UI

import { ImportControl } from './gui-import-control';
import { SimplifyControl } from './gui-simplify-control';
import { Console } from './gui-console';
import { AlertControl } from './gui-alert';
import { RepairControl } from './gui-repair-control';
import { ExportControl } from './gui-export-control';
import { LayerControl } from './gui-layer-control';
import { GuiInstance } from './gui-instance';
import { onload } from './dom-utils';
import { GUI } from './gui-lib';
import { El } from './gui-el';

onload(function() {
  if (!GUI.browserIsSupported()) {
    El("#mshp-not-supported").show();
    return;
  }
  startEditing();
});

function getManifest() {
  return window.mapshaper.manifest || {}; // kludge -- bin/mapshaper-gui sets this
}

function getImportOpts(manifest) {
  var vars = GUI.getUrlVars();
  var opts = {};
  if (manifest.files) {
    opts.files = manifest.files.concat();
  } else {
    opts.files = [];
  }
  if (vars.files) {
    opts.files = opts.files.concat(vars.files.split(','));
  }
  if (manifest.catalog) {
    opts.catalog = manifest.catalog;
  }
  opts.display_all = vars['display-all'] || vars.a || !!manifest.display_all;
  opts.quick_view = vars['quick-view'] || vars.q || !!manifest.quick_view;
  opts.target = vars.target || manifest.target || null;
  opts.name = vars.name || manifest.name || null;
  return opts;
}

function getInitialConsoleCommands() {
  return getManifest().commands || '';
}

var startEditing = function() {
  var dataLoaded = false,
      manifest = getManifest(),
      importOpts = getImportOpts(manifest),
      gui = new GuiInstance('body');

  if (manifest.blurb) {
    El('#splash-screen-blurb').text(manifest.blurb);
  }

  new AlertControl(gui);
  new RepairControl(gui);
  new SimplifyControl(gui);
  new ImportControl(gui, importOpts);
  new ExportControl(gui);
  new LayerControl(gui);
  gui.console = new Console(gui);

  startEditing = function() {};

  window.addEventListener('beforeunload', function(e) {
    // don't prompt if there are no datasets (this means the last layer was deleted,
    // hitting the 'cancel' button would leave the interface in a bad state)
    if (gui.session.unsavedChanges() && !gui.model.isEmpty()) {
      e.returnValue = 'There are unsaved changes.';
      e.preventDefault();
    }
  });

  window.addEventListener('unload', function(e) {
    if (window.location.hostname == 'localhost') {
      // send termination signal for mapshaper-gui
      var req = new XMLHttpRequest();
      req.open('GET', '/close');
      req.send();
    }
  });

  // Initial display configuration
  gui.model.on('select', function() {
    if (dataLoaded) return;
    dataLoaded = true;
    El('#mode-buttons').show();
    if (importOpts.display_all) {
      gui.model.getLayers().forEach(function(o) {
        gui.map.setLayerPinning(o, true);
      });
    }
    gui.console.runInitialCommands(getInitialConsoleCommands());

  });
};
