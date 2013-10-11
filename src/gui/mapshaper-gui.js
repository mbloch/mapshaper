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
mapshaper-import,
mapshaper-segments
*/

var dropper,
    importer,
    editor;

if (Browser.inBrowser) {
  Browser.onload(function() {
    if (!browserIsSupported()) {
      El("#mshp-not-supported").show();
      return;
    }
    editor = new Editor();
    importer = new ImportControl(editor);
    dropper = new DropControl(importer);
    introPage();
  });
}

function introPage() {
  new FileChooser('#g-shp-import-btn').on('select', function(e) {
    importer.readFiles(e.files);
  });
  El('#mshp-import').show();
}

/*
function ImportPanel(importer) {
  var shpBtn = new FileChooser('#g-shp-import-btn');
  shpBtn.on('select', function(e) {
    importer.readFiles(e.files);
  });
}

Opts.inherit(ImportPanel, EventDispatcher);
*/

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
    simplifyMethod: "mod",
    preserveShapes: false,
    findIntersections: false
  };

  function init(contentBounds) {
    El("#mshp-intro-screen").hide();
    El("#mshp-main-page").show();
    El("body").addClass('editing');

    importOpts.preserveShapes = !!El("#g-import-retain-opt").node().checked;
    importOpts.findIntersections = !!El("#g-import-find-intersections-opt").node().checked;
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
      MapShaper.protectRingsFromCollapse(arcData, data.retainedPointCounts);
    }

    var filteredArcs = new FilteredPathCollection(arcData);
    var group = new ArcLayerGroup(filteredArcs);

    map.addLayerGroup(group);

    // Add layer for intersections
    if (importOpts.findIntersections) {
      var initialIntersections = MapShaper.getIntersectionPoints(arcData);
      var collisions = new FilteredPathCollection(initialIntersections, {
          min_segment: 0,
          min_path: 0
        });
      var collisionGroup = new ArcLayerGroup(collisions, {
        //strokeColor: "#FFDB2C",
        dotSize: 5,
        dotColor: "#F24400"
      });
      map.addLayerGroup(collisionGroup);

      slider.on('simplify-start', function() {
        collisionGroup.visible(false);
      });

      slider.on('simplify-end', function() {
        collisionGroup.visible(true);
        var arcs = slider.value() == 1 ? initialIntersections :
            MapShaper.getIntersectionPoints(arcData);
        collisions.update(arcs);
        collisionGroup.refresh();
      });
    }

    slider.on('change', function(e) {
      filteredArcs.setRetainedPct(e.value);
      group.refresh();
    });

    var exportOpts = {
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
