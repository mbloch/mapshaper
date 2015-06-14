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

zip.workerScripts = {
  // deflater: ['z-worker.js', 'deflate.js'], // use zip.js deflater
  // TODO: find out why it was necessary to rename pako_deflate.min.js
  deflater: ['z-worker.js', 'pako/pako.deflate.js', 'pako/codecs.js'],
  inflater: ['z-worker.js', 'pako/pako.inflate.js', 'pako/codecs.js']
};

if (Browser.inBrowser) {
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
  var map, exporter, slider;

  this.editDataset = function(dataset, opts) {
    if (datasets.length > 0) {
      return; // kludge; only edit first dataset
    } else {
      startEditing();
    }
    datasets.push(dataset);
    editDataset(dataset, opts);
  };

  function startEditing() {
    map = new MshpMap("#mshp-main-map");
    exporter = new ExportControl();
    El("#mshp-main-page").show();
    El("body").addClass('editing');
  }

  function editDataset(dataset, opts) {
    var displayLyr = dataset.layers[0]; // TODO: multi-layer display
    var type = displayLyr.geometry_type;
    var group = new LayerGroup(dataset);
    var repair;

    exporter.setDataset(dataset);
    map.addLayerGroup(group);
    group.showLayer(displayLyr)
      .setStyle({
        strokeColor: "#335",
        dotColor: "#223",
        squareDot: true
      })
      .refresh();

    if (type == 'polygon' || type == 'polyline') {
      slider = new SimplifyControl();
      slider.on('change', function(e) {
        group.setRetainedPct(e.value).refresh();
      });
      if (!opts.no_repair) {
        // use timeout so map appears before the repair control calculates
        // intersection data, which can take a little while
        setTimeout(initRepair, 10);
      }
    }

    function initRepair() {
      repair = new RepairControl(map, dataset.arcs);
      slider.on('simplify-start', function() {
        repair.clear();
      });
      slider.on('simplify-end', function() {
        repair.update(slider.value());
      });
      repair.on('repair', function() {
        group.refresh();
      });
    }
  }
}

Opts.extendNamespace("mapshaper", api);
