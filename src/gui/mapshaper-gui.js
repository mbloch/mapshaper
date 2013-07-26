/* @requires
mapshaper-shapes,
mapshaper-controls,
mapshaper-topology,
mapshaper-map,
mapshaper-maplayer,
mapshaper-simplify,
mapshaper-visvalingam,
mapshaper-dp,
mapshaper-export
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
      bounds: contentBounds, // arcData.getBounds(),
      padding: 10
    };
    map = new MshpMap("#mshp-main-map", mapOpts);
    slider = new SimplifyControl();
  };

  this.addData = function(importData, opts) {

    var topoData = MapShaper.buildTopology(importData); // obj.xx, obj.yy, obj.partIds, obj.shapeIds
    var arcData = new ArcDataset(topoData.arcs),
        vertexData;

    if (!map) {
      init(arcData.getBounds());
    }

    var inputBounds = importData.info.input_bounds;
    var vertexData = MapShaper.simplifyPaths(topoData.arcs, importOpts.simplifyMethod, inputBounds);

    if (importOpts.preserveShapes) {
      MapShaper.protectRingsFromCollapse(vertexData, topoData.arcMinPointCounts);
    }

    arcData.setThresholdsForGUI(vertexData);

    var group = new ArcLayerGroup(arcData);
    map.addLayerGroup(group);

    slider.on('change', function(e) {
      arcData.setRetainedPct(e.value);
      group.refresh();
    });

    var exportOpts = {
      bounds: arcData.getBounds(),
      geometry: importData.info.input_geometry_type,
      properties: importData.properties || null
    };
    if (opts.input_file) {
      var parts = MapShaper.parseLocalPath(opts.input_file);
      exportOpts.output_name = parts.basename;
    }

    // TODO: figure out exporting with multiple datasets
    var exporter = new ExportControl(arcData, topoData, exportOpts);
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
