/* @requires
mapshaper-shapes,
mapshaper-simplify-control,
mapshaper-import-control,
mapshaper-export-control,
mapshaper-topology,
mapshaper-map,
mapshaper-maplayer,
mapshaper-simplify,
mapshaper-export,
mapshaper-repair-control,
mapshaper-keep-shapes
*/

// MapShaper.LOGGING = true;
api.enableLogging();

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
  var map, slider;

  var importOpts = {
    simplifyMethod: "mapshaper",
    preserveShapes: false,
    repairIntersections: false
  };

  function init(contentBounds) {
    El("#mshp-intro-screen").hide();
    El("#mshp-main-page").show();
    El("body").addClass('editing');

    importOpts.preserveShapes = !!El("#g-import-retain-opt").node().checked;
    importOpts.repairIntersections = !!El("#g-repair-intersections-opt").node().checked;
    importOpts.simplifyMethod = El('#g-simplification-menu input[name=method]:checked').attr('value');

    var mapOpts = {
      bounds: contentBounds,
      padding: 12
    };
    map = new MshpMap("#mshp-main-map", mapOpts);
    slider = new SimplifyControl();
  }

  this.addData = function(dataset, opts) {
    if (!map) init(MapShaper.getDatasetBounds(dataset));

    MapShaper.simplifyPaths(dataset.arcs, {method:importOpts.simplifyMethod});
    console.log(importOpts);
    if (importOpts.preserveShapes) {
      MapShaper.protectShapes(dataset.arcs, dataset.layers);
    }

    var group = new LayerGroup(dataset);
    map.addLayerGroup(group);
    group
      .showArcs()
      .setStyle({
        strokeColor: "#335"
      })
      .refresh();

    if (importOpts.repairIntersections) {
      var repair = new RepairControl(map, dataset.arcs);
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

    slider.on('change', function(e) {
      group.setRetainedPct(e.value).refresh();
    });

    var exportOpts = {
    //  precision: opts.precision || null,
    //   output_file_base: utils.parseLocalPath(opts.input_file).basename || "out"
    };
    var exporter = new ExportControl(dataset, exportOpts);
  };
}

Opts.extendNamespace("mapshaper", api);
