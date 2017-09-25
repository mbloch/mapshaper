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
mapshaper-maplayer
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
  var opts = {};
  if (Array.isArray(mapshaper.manifest)) {
    // old-style manifest: an array of filenames
    opts.files = mapshaper.manifest;
  } else if (mapshaper.manifest && mapshaper.manifest.files) {
    utils.extend(opts, mapshaper.manifest);
  } else {
    opts.files = [];
  }
  if (vars.files) {
    opts.files = opts.files.concat(vars.files.split(','));
  }
  return opts;
};

gui.startEditing = function() {
  var model = new Model(),
      dataLoaded = false,
      map, repair, simplify;
  gui.startEditing = function() {};
  map = new MshpMap(model);
  repair = new RepairControl(model, map);
  simplify = new SimplifyControl(model);
  new AlertControl();
  new ImportFileProxy(model);
  new ImportControl(model, gui.getImportOpts());
  new ExportControl(model);
  new LayerControl(model, map);

  model.on('select', function() {
    if (!dataLoaded) {
      dataLoaded = true;
      El('#mode-buttons').show();
      new Console(model);
    }
  });
  // TODO: untangle dependencies between SimplifyControl, RepairControl and Map
  simplify.on('simplify-start', function() {
    repair.hide();
  });
  simplify.on('simplify-end', function() {
    repair.update();
  });
  simplify.on('change', function(e) {
    map.setSimplifyPct(e.value);
  });
};
