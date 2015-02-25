/* @requires
mapshaper-gui-utils,
mapshaper-file-types,
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
  var map;

  this.addData = function(dataset) {
    if (map) return; // one layer at a time, for now

    var method = El('#g-simplification-menu input[name=method]:checked').attr('value') || "mapshaper";
    var useRepair = !!El("#g-repair-intersections-opt").node().checked;
    var keepShapes = !!El("#g-import-retain-opt").node().checked;

    El("#mshp-intro-screen").hide();
    El("#mshp-main-page").show();
    El("body").addClass('editing');

    var mapOpts = {
      bounds: MapShaper.getDatasetBounds(dataset),
      padding: 12
    };
    map = new MshpMap("#mshp-main-map", mapOpts);

    var displayLyr = dataset.layers[0]; // TODO: multi-layer display
    var type = displayLyr.geometry_type;
    var group = new LayerGroup(dataset);
    var exporter = new ExportControl(dataset, {});
    var slider, repair;

    map.addLayerGroup(group);

    if (type == 'polygon' || type == 'polyline') {
      slider = new SimplifyControl();
      MapShaper.simplifyPaths(dataset.arcs, {method:method});
      if (keepShapes) {
        MapShaper.keepEveryPolygon(dataset.arcs, dataset.layers);
      }
      if (useRepair) {
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

      slider.on('change', function(e) {
        group.setRetainedPct(e.value).refresh();
      });
    }

    group
      .showLayer(displayLyr)
      .setStyle({
        strokeColor: "#335",
        dotColor: "#223",
        squareDot: true
      })
      .refresh();
  };
}

Opts.extendNamespace("mapshaper", api);
