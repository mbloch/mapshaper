// This is the entry point for bundling mapshaper's web UI

import { ImportControl } from './gui-import-control';
import { SimplifyControl } from './gui-simplify-control';
import { Console } from './gui-console';
import { AlertControl } from './gui-alert';
import { IntersectionControl } from './gui-intersection-control';
import { ExportControl } from './gui-export-control';
import { LayerControl } from './gui-layer-control';
import { HeaderMenu } from './gui-header-menu';
import { GuiInstance } from './gui-instance';
import { onload } from './dom-utils';
import { GUI } from './gui-lib';
import { El } from './gui-el';

// Refresh detection for mapshaper-gui: if the previous incarnation of this
// tab set the 'navigating away' marker on pagehide, then this page load is a
// reload (not a fresh tab). Tell the server to cancel any pending /close,
// otherwise the server's grace window can race past while the new page is
// idle and terminate the process. sessionStorage is per-tab and survives a
// refresh, but is gone after a real close -- exactly the signal we need.
// This runs before onload to fire as early as possible in the page lifecycle.
if (typeof window !== 'undefined' &&
    window.location.hostname === 'localhost' &&
    window.sessionStorage &&
    window.sessionStorage.getItem('mapshaper_navigating_away')) {
  window.sessionStorage.removeItem('mapshaper_navigating_away');
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/cancel-close');
  } else {
    try { fetch('/cancel-close', {method: 'GET', keepalive: true}); } catch (err) {}
  }
}

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

  if (!importOpts.files?.length) {
    // show header links if not preloading files
    document.documentElement.classList.remove('mapshaper-preload');
  }

  new AlertControl(gui);
  new IntersectionControl(gui);
  new SimplifyControl(gui);
  new ImportControl(gui, importOpts);
  new ExportControl(gui);
  new LayerControl(gui);
  HeaderMenu();
  gui.console = new Console(gui);
  window.mapshaper.getRuntimeStateContext = gui.getRuntimeStateContext;
  window.mapshaper.stringifyRuntimeStateContext = gui.stringifyRuntimeStateContext;

  startEditing = function() {};

  window.addEventListener('beforeunload', function(e) {
    // don't prompt if there are no datasets (this means the last layer was deleted,
    // hitting the 'cancel' button would leave the interface in a bad state)
    if (gui.session.unsavedChanges() && !gui.model.isEmpty()) {
      e.returnValue = 'There are unsaved changes.';
      e.preventDefault();
    }
  });

  // Send termination signal to mapshaper-gui when the tab is closed.
  // Use 'pagehide' rather than 'unload' (the latter is increasingly suppressed
  // by Chrome/Edge for bfcache reasons), and use sendBeacon / keepalive fetch
  // because async XHR in the unload path is not guaranteed to be sent.
  // The sessionStorage marker is the refresh-vs-close signal: if a new page
  // loads in the same tab, it'll see the marker and send /cancel-close to
  // abort the pending exit (see the top of this file).
  window.addEventListener('pagehide', function(e) {
    if (window.location.hostname != 'localhost') return;
    if (e.persisted) return; // page is being cached, not actually closed
    try { window.sessionStorage.setItem('mapshaper_navigating_away', '1'); } catch (err) {}
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/close');
    } else {
      try {
        fetch('/close', {method: 'GET', keepalive: true});
      } catch (err) {}
    }
  });

  // Initial display configuration
  gui.on('mode', function(e) {
    if (dataLoaded) return;
    dataLoaded = true;
    gui.buttons.show();
    gui.basemap.show();
    El('#mode-buttons').show(); // show Simplify, Console, Export, etc.
    El('#splash-buttons').hide(); // hide Wiki, Github buttons
    El('body').addClass('map-view');
    gui.console.runInitialCommands(getInitialConsoleCommands());
  });
};
