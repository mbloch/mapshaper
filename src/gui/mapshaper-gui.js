/* @requires
mapshaper-gui-lib
mapshaper-simplify-control
mapshaper-import-control
mapshaper-export-control
mapshaper-repair-control
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
  El('.mshp-version').text(MapShaper.VERSION);
  if (!gui.browserIsSupported()) {
    El("#mshp-not-supported").show();
    return;
  }
  var editor = new Editor(),
      importer = new ImportControl(editor);
  El('#mshp-import').show(); // show import screen
});

function Editor() {
  var model = new Model().on('select', onSelect),
      map, exporter, simplify, repair, cons;

  this.editDataset = function(dataset, opts) {
    if (model.size() === 0) {
      startEditing();
    }
    if (model.size() > 1) {
      model.removeDataset(model.getDatasets().shift());
    }
    model.setEditingLayer(dataset.layers[0], dataset, opts);
  };

  function startEditing() {
    map = new MshpMap("#mshp-main-map", model);
    cons = new Console('#mshp-main-map', model);
    exporter = new ExportControl();
    repair = new RepairControl(map);
    simplify = new SimplifyControl();
    El("#mshp-main-page").show();

    simplify.on('simplify-start', function() {
      // repair.clear();
    });
    simplify.on('simplify-end', function() {
      repair.update();
    });
    simplify.on('change', function(e) {
      map.setSimplifyPct(e.value);
    });
    repair.on('repair', function() {
      model.updated();
    });
  }

  function onSelect(e) {
    var dataset = e.dataset;
    // hide widgets if visible and remove any old event handlers
    exporter.setDataset(dataset);
    simplify.reset();
    repair.reset();
    // map.refresh(); // redraw all map layers

    if (MapShaper.layerHasPaths(e.layer)) {
      simplify.show();
      simplify.value(dataset.arcs.getRetainedPct());

      if (!e.opts.no_repair) {
        repair.setDataset(dataset);
        // use timeout so map appears before the repair control calculates
        // intersection data, which can take a little while
        setTimeout(function() {
          // repair.show();
          repair.update();
        }, 10);
      }
    }
  }
}
