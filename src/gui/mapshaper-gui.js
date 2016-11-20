/* @requires
mapshaper-gui-lib
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
  var urlFiles = vars.files ? vars.files.split(',') : [];
  var manifestFiles = mapshaper.manifest || [];
  return {
    files: urlFiles.concat(manifestFiles)
  };
};

gui.startEditing = function() {
  var model = new Model(),
      dataLoaded = false,
      map, repair, simplify;
  gui.startEditing = function() {};
  gui.alert = new ErrorMessages(model);
  map = new MshpMap(model);
  repair = new RepairControl(model, map);
  simplify = new SimplifyControl(model);
  new ImportFileProxy(model);
  new ImportControl(model, gui.getImportOpts());
  new ExportControl(model);
  new LayerControl(model);

  model.on('select', function() {
    if (!dataLoaded) {
      dataLoaded = true;
      El('#mode-buttons').show();
      El('#nav-buttons').show();
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
