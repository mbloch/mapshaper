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
mapshaper-simplify
mapshaper-export
mapshaper-shapes
mapshaper-topology
mapshaper-keep-shapes
mapshaper-console
mapshaper-gui-model
*/

Browser.onload(function() {
  El('#mshp-version').text('v' + MapShaper.VERSION);
  if (!gui.browserIsSupported()) {
    El("#mshp-not-supported").show();
  } else {
    gui.startEditing();
  }
});

gui.startEditing = function() {
  var model = new Model(),
      dataLoaded = false,
      map, repair;
  gui.startEditing = function() {};
  gui.alert = new ErrorMessages(model);
  gui.simplify = new SimplifyControl(model);
  map = new MshpMap(model);
  repair = new RepairControl(model, map);
  new ImportFileProxy(model);
  new ImportControl(model);
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
  gui.simplify.on('simplify-start', function() {
    repair.hide();
  });
  gui.simplify.on('simplify-end', function() {
    repair.update();
  });
  gui.simplify.on('change', function(e) {
    map.setSimplifyPct(e.value);
  });
  gui.simplify.on('operation', function(opts) {
    var starting = opts.operation ? 0.05 : 0.5,
        value = Math.min(1, ((opts.scale / 10) + 1) * starting);

    gui.operation = opts.operation;
    map.setSimplifyPct(value);
  });
};
