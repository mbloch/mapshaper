/* @requires mapshaper-gui-lib */

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
      arcs = arcData.getArcTable(),
      calculator, vertexData, intervalScale;

    if (!map) {
      init(arcData.getBounds());
    }

    if (importOpts.simplifyMethod == 'dp') {
      calculator = DouglasPeucker.calcArcData;
    }
    else if (importOpts.simplifyMethod == 'vis') {
      intervalScale = 0.65; // TODO: tune this constant (linear scale when converting Visv. area metric to distance units);
      calculator = Visvalingam.getArcCalculator(Visvalingam.standardMetric, Visvalingam.standardMetric3D, intervalScale);
    }
    else if (importOpts.simplifyMethod == 'mod') {
      intervalScale = 0.65 // TODO: tune this
      calculator = Visvalingam.getArcCalculator(Visvalingam.specialMetric, Visvalingam.specialMetric3D, intervalScale);
    }
    else {
      error("Unknown simplification method:", method);
    }

    var sopts = {
      spherical: opts.spherical || probablyDecimalDegreeBounds(importData.info.input_bounds)
    };
    vertexData = MapShaper.simplifyArcs(topoData.arcs, calculator, sopts);

    if (importOpts.preserveShapes) {
      MapShaper.protectPoints(vertexData, topoData.arcMinPointCounts);
    }

    arcData.setThresholds(vertexData);

    var group = new ArcLayerGroup(arcs);
    map.addLayerGroup(group);

    slider.on('change', function(e) {
      arcData.setRetainedPct(e.value);
      group.refresh();
    });

    trace(importData.info);
    var exportOpts = {
      bounds: arcData.getBounds(),
      geometry: importData.info.input_geometry_type
    };
    if (opts.input_file) {
      var parts = MapShaper.parseLocalPath(opts.input_file);
      exportOpts.output_name = parts.basename;
    }

    // TODO: figure out exporting with multiple datasets
    var exporter = new ExportControl(arcData, topoData, exportOpts);
  };
}
