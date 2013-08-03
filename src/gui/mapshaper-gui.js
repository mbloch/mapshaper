/* @requires
mapshaper-shapes,
mapshaper-controls,
mapshaper-topology,
mapshaper-map,
mapshaper-maplayer,
mapshaper-simplify,
mapshaper-export,
mapshaper-import
*/

var dropper,
    importer,
    editor;

if (Browser.inBrowser) {
  Browser.onload(function() {
    var testFile;
    if (!browserIsSupported()) {
      El("#mshp-not-supported").show();
      return;
    }
    El('#mshp-import').show();
    editor = new Editor();
    importer = new ImportControl(editor);
    dropper = new DropControl(importer);
    if (testFile = Browser.getQueryVar('file')) {
      importer.loadFile(testFile);
    } else {
      introPage();
    }
  });
}

function introPage() {
  new FileChooser('#g-shp-import-btn').on('select', function(e) {
    importer.readFiles(e.files);
  });
  // El("#mshp-import").show();
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
    preserveShapes: false
  };

  function init(contentBounds) {
    El("#mshp-intro-screen").hide();
    El("#mshp-main-page").show();
    El("body").addClass('editing');

    importOpts.preserveShapes = !!El("#g-import-retain-opt").node().checked;
    importOpts.simplifyMethod = El('#g-simplification-menu input[name=method]:checked').attr('value');

    var mapOpts = {
      bounds: contentBounds,
      padding: 12
    };
    map = new MshpMap("#mshp-main-map", mapOpts);
    slider = new SimplifyControl();
  };

  this.addData = function(data, opts) {

    var arcData = new ArcDataset(data.arcs),
        bounds = arcData.getBounds(),
        vertexData;

    if (!map) {
      init(bounds);
    }

    var vertexData = MapShaper.simplifyPaths(data.arcs, importOpts.simplifyMethod, bounds.toArray());

    if (importOpts.preserveShapes) {
      MapShaper.protectRingsFromCollapse(vertexData, data.retainedPointCounts);
    }

    arcData.setThresholdsForGUI(vertexData);

    var group = new ArcLayerGroup(arcData);
    map.addLayerGroup(group);

    slider.on('change', function(e) {
      arcData.setRetainedPct(e.value);
      group.refresh();
    });


    var fileBase = MapShaper.parseLocalPath(opts.input_file).basename || "out";
    var exporter = new ExportControl(arcData, data.layers, fileBase);
  };
}

var api = {
  ArcDataset: ArcDataset,
  Utils: Utils,
  controls: controls,
  trace: trace,
  error: error
}

Opts.extendNamespace("mapshaper", api);
