/* @requires
gui-lib
gui-instance
gui-error
gui-simplify-control
gui-import-control
gui-export-control
gui-repair-control
gui-layer-control
gui-console
*/

Browser.onload(function() {
  if (!GUI.browserIsSupported()) {
    El("#mshp-not-supported").show();
    return;
  }
  startEditing();
  if (window.location.hostname == 'localhost') {
    window.addEventListener('beforeunload', function() {
      // send termination signal for gui.js
      var req = new XMLHttpRequest();
      req.open('GET', '/close');
      req.send();
    });
  }
});

function getImportOpts() {
  var vars = GUI.getUrlVars();
  var manifest = mapshaper.manifest || {};
  var opts = {};
  if (Array.isArray(manifest)) {
    // old-style manifest: an array of filenames
    opts.files = manifest;
  } else if (manifest.files) {
    opts.files = manifest.files.concat();
    opts.quick_view = !!manifest.quick_view;
  } else {
    opts.files = [];
  }
  if (vars.files) {
    opts.files = opts.files.concat(vars.files.split(','));
  }
  if (manifest.catalog) {
    opts.catalog = manifest.catalog;
  }
  opts.display_all = !!manifest.display_all;
  return opts;
}

var startEditing = function() {
  var dataLoaded = false,
      importOpts = getImportOpts(),
      gui = new GuiInstance('body');

  new AlertControl(gui);
  new RepairControl(gui);
  new SimplifyControl(gui);
  new ImportControl(gui, importOpts);
  new ExportControl(gui);
  new LayerControl(gui);
  gui.console = new Console(gui);

  startEditing = function() {};

  gui.model.on('select', function() {
    if (!dataLoaded) {
      dataLoaded = true;
      El('#mode-buttons').show();
      if (importOpts.display_all) {
        gui.model.getLayers().forEach(function(o) {
          gui.map.setLayerVisibility(o, true);
        });
      }
    }
  });
};
