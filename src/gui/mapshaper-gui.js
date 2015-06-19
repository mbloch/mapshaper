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
*/

api.enableLogging();

if (Env.inBrowser) {
  Browser.onload(function() {
    if (!browserIsSupported()) {
      El("#mshp-not-supported").show();
      return;
    }
    var editor = new Editor(),
        importer = new ImportControl(editor);
    El('#mshp-import').show(); // show import screen
  });
}

function browserIsSupported() {
  return Env.inBrowser &&
    Env.canvas &&
    typeof ArrayBuffer != 'undefined' &&
    typeof Blob != 'undefined' &&
    typeof File != 'undefined';
}

function Editor() {
  var datasets = [];
  var foregroundStyle = {
        strokeColor: "#335",
        dotColor: "#223",
        squareDot: true
      };
  var bgStyle = {
        strokeColor: "#aaa",
        dotColor: "#aaa",
        squareDot: true
      };
  var map, exporter, slider, repair;

  this.editDataset = function(dataset, opts) {
    datasets.push(dataset);
    if (datasets.length > 2) {
      map.findLayer(datasets.shift()).remove();
    }
    if (datasets.length > 1) {
      map.findLayer(datasets[0]).setStyle(bgStyle);
    } else {
      startEditing();
    }

    editDataset(dataset, opts);
  };

  function startEditing() {
    map = new MshpMap("#mshp-main-map");
    exporter = new ExportControl();
    repair = new RepairControl(map);
    slider = new SimplifyControl();
    El("#mshp-main-page").show();
  }

  function editDataset(dataset, opts) {
    var displayLyr = dataset.layers[0];
    var group = map.addLayer(dataset);

    exporter.setDataset(dataset);
    group.showLayer(displayLyr)
      .setStyle(foregroundStyle);

    // hide widgets if visible and remove any old event handlers
    slider.reset();
    repair.reset();

    map.refresh(); // redraw all map layers

    if (opts.method && dataset.arcs) {
      slider.show();
      slider.value(dataset.arcs.getRetainedPct());
      slider.on('change', function(e) {
        group.setRetainedPct(e.value).refresh();
      });
      if (!opts.no_repair) {
        repair.setDataset(dataset);
        // use timeout so map appears before the repair control calculates
        // intersection data, which can take a little while
        setTimeout(initRepair, 10);
      }
    }

    function initRepair() {
      repair.show();
      repair.update();
      slider.on('simplify-start', function() {
        repair.clear();
      });
      slider.on('simplify-end', function() {
        repair.update();
      });
      repair.on('repair', function() {
        group.refresh();
      });
    }
  }
}
