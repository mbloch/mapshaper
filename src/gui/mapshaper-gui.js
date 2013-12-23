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

MapShaper.LOGGING = true;

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
    simplifyMethod: "mod2",
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

  this.addData = function(data, opts) {
    var arcData = data.arcs;
    if (!map) init(arcData.getBounds());

    MapShaper.simplifyPaths(arcData, importOpts.simplifyMethod);
    if (importOpts.preserveShapes) {
      MapShaper.protectShapes(arcData, data.layers);
    }

    var filteredArcs = new FilteredPathCollection(arcData);
    var group = new ArcLayerGroup(filteredArcs);
    map.addLayerGroup(group);

    // visualize point snapping by displaying snapped points on the map
    // (see debug_snapping option in mapshaper_import_control.js)
    try {
      var snaps = data.layers[0].info.snapped_points;
      if (snaps) {
        var snappedPaths = new ArcDataset(snaps);
        var snapColl = new FilteredPathCollection(snappedPaths, {
          min_segment: 0, min_path: 0
        });
        map.addLayerGroup(new ArcLayerGroup(snapColl, {
          dotSize: 4,
          dotColor: "rgba(0, 200, 0, 0.5)",
          strokeColor: "rgba(0, 0, 255, 0.2)"
        }));
      }
    } catch (e) {}


    // Intersections
    if (importOpts.repairIntersections) {
      var repair = new RepairControl(map, group, arcData);
      slider.on('simplify-start', function() {
        repair.clear();
      });
      slider.on('simplify-end', function() {
        repair.update(slider.value());
      });
    }

    slider.on('change', function(e) {
      filteredArcs.setRetainedPct(e.value);
      group.refresh();
    });

    var exportOpts = {
      precision: opts.precision || null,
      output_file_base: MapShaper.parseLocalPath(opts.input_file).basename || "out"
    };
    var exporter = new ExportControl(arcData, data.layers, exportOpts);
  };
}

var api = {
  ArcDataset: ArcDataset,
  Utils: Utils,
  trace: trace,
  error: error
};

Opts.extendNamespace("mapshaper", api);
