/* @requires
mapshaper-gui-lib
mapshaper-gui-error
mapshaper-simplify-control
mapshaper-import-control
mapshaper-export-control
mapshaper-repair-control
mapshaper-layer-control
mapshaper-gui-proxy
mapshaper-map
mapshaper-console
mapshaper-gui-model
mapshaper-gui-modes
*/

Browser.onload(function() {
  if (!gui.browserIsSupported()) {
    El("#mshp-not-supported").show();
    return;
  }
  gui.startEditing();
  if (window.location.hostname == 'localhost') {
    window.addEventListener('beforeunload', function() {
      // send termination signal for mapshaper-gui
      var req = new XMLHttpRequest();
      req.open('GET', '/close');
      req.send();
    });
  }
});

gui.getImportOpts = function() {
  var vars = gui.getUrlVars();
  var manifest = mapshaper.manifest || {};
  var opts = {};
  if (Array.isArray(manifest)) {
    // old-style manifest: an array of filenames
    opts.files = manifest;
  } else if (manifest.files) {
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
  opts.display_all = !!manifest.display_all;
  return opts;
};

gui.startEditing = function() {
  var dataLoaded = false,
      importOpts = gui.getImportOpts(),
      map;
  gui.startEditing = function() {};
  map = new MshpMap(gui);
  new RepairControl(gui, map);
  new SimplifyControl(gui);
  new AlertControl();
  new ImportFileProxy(gui.model);
  new ImportControl(gui.model, importOpts);
  new ExportControl(gui);
  new LayerControl(gui, map);
  new Console(gui.model);

  gui.model.on('select', function() {
    if (!dataLoaded) {
      dataLoaded = true;
      El('#mode-buttons').show();
      if (importOpts.display_all) {
        gui.model.getLayers().forEach(function(o) {
          map.setLayerVisibility(o, true);
        });
      }
    }
  });
};
