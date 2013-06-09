/* @requires mapshaper-gui-lib */

if (Browser.inBrowser) {
  Browser.onload(function() {
    var testFile;
    if (!browserIsSupported()) {
      El("#mshp-not-supported").show();
    } else if (testFile = Browser.getQueryVar('file')) {
      editorTest(testFile);
    } else {
      introPage();
    }
  })
}

function introPage() {
  new ImportPanel(editorPage);
  El("#mshp-import").show();
}

function browserIsSupported() {
  return Env.inBrowser && Env.canvas && typeof 'ArrayBuffer' != 'undefined';
}

function editorTest(shp) {
  Utils.loadBinaryData(shp, function(buf) {
    var shpData = MapShaper.importShp(buf),
        opts = {};

    editorPage(shpData, opts);
  })
}

function editorPage(importData, opts) {
  var decimalDegrees = containsBounds([-200, -100, 200, 100], importData.info.input_bounds);
  var topoData = MapShaper.buildArcTopology(importData); // obj.xx, obj.yy, obj.partIds, obj.shapeIds

  // hide intro page
  El("#mshp-intro-screen").hide();
  // show main page
  El("#mshp-main-page").show();

  // init editor
  var arcs = new ArcDataset(topoData.arcs);
  var sopts = {
    spherical: opts.spherical || decimalDegrees
  };

  trace(">> sopts:", sopts)
  var intervalScale = 0.65, // TODO: tune this
      calculator = Visvalingam.getArcCalculator(Visvalingam.specialMetric, Visvalingam.specialMetric3D, intervalScale),
      vertexData = MapShaper.simplifyArcs(topoData.arcs, calculator, sopts);

  // TODO: protect shapes from elimination

  arcs.setThresholds(vertexData);

  var group = new ArcLayerGroup(arcs);

  var opts = {
    bounds: arcs.getBounds(),
    padding: 10
  };

  var map = new MshpMap("#mshp-main-map", opts);
  map.addLayerGroup(group);
  map.display();

  var slider = new SimplifyControl();

  slider.on('change', function(e) {
    arcs.setRetainedPct(e.value);
    group.refresh();
  });
}
