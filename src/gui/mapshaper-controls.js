/* @require mapshaper-elements, textutils, mapshaper-shapefile, mapshaper-geojson, mapshaper-topojson */

var ExportControl = function(arcData, topoData, opts) {
  var filename = opts && opts.output_name || "out";

  var el = El('#g-export-control').show();
  var anchor = el.newChild('a').attr('href', '#').node();
  var geoBtn = new SimpleButton('#g-geojson-btn').active(true).on('click', function() {
    geoBtn.active(false);
    setTimeout(exportGeoJSON, 10); // kludgy way to show button response
  });
  var shpBtn = new SimpleButton('#g-shapefile-btn').active(true).on('click', function() {
    shpBtn.active(false);
    exportZippedShapefile();
  });
  var topoBtn = new SimpleButton('#g-topojson-btn').active(true).on('click', function() {
    topoBtn.active(false);
    setTimeout(exportTopoJSON, 10);
  });

  function exportBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = filename;
    var clickEvent = document.createEvent("MouseEvent");
    clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    anchor.dispatchEvent(clickEvent);
  }

  function exportGeoJSON() {
    var json = MapShaper.exportGeoJSON({ arcs: arcData.shapes().toArray(), shapes: topoData.shapes });
    exportBlob(filename + ".json", new Blob([json]));
    geoBtn.active(true);
  }

  function exportTopoJSON() {
    var json = MapShaper.exportTopoJSON({arcs: arcData.shapes().toArray(), shapes: topoData.shapes, bounds: opts.bounds});
    exportBlob(filename + ".topo.json", new Blob([json]));
    topoBtn.active(true);
  }

  function exportZippedShapefile() {
    var data = exportShapefile(),
        shp = new Blob([data.shp]),
        shx = new Blob([data.shx]);

    function addShp(writer) {
      writer.add(filename + ".shp", new zip.BlobReader(shp), function() {
        addShx(writer);
      }, null); // last arg: onprogress
    }

    function addShx(writer) {
      writer.add(filename + ".shx", new zip.BlobReader(shx), function() {
        writer.close(function(blob) {
          exportBlob(filename + ".zip", blob)
          shpBtn.active(true);
        });
      }, null);
    }

    zip.createWriter(new zip.BlobWriter("application/zip"), addShp, error);
  }

  function exportShapefile() {
    return MapShaper.exportShp(arcData.shapes().toArray(), topoData.shapes, 5);
  }

};


var SimplifyControl = function() {
  var _value = 1;

  El('#g-simplify-control').showCSS('display:inline-block').show();
  var slider = new Slider("#g-simplify-control .g-slider");
  slider.handle("#g-simplify-control .g-handle");
  slider.track("#g-simplify-control .g-track");
  slider.on('change', function(e) {
    var pct = fromSliderPct(e.pct);
    text.value(pct);
    onchange(pct);
  });

  var text = new ClickText("#g-simplify-control .g-clicktext");
  text.bounds(0, 1);
  text.formatter(function(val) {
    if (isNaN(val)) return '-';

    var pct = val * 100;
    var decimals = 0;
    if (pct <= 0) decimals = 1;
    else if (pct < 0.001) decimals = 4;
    else if (pct < 0.01) decimals = 3;
    else if (pct < 1) decimals = 2;
    else if (pct < 100) decimals = 1;
    return Utils.formatNumber(pct, decimals) + "%";
  });

  text.parser(function(s) {
    return parseFloat(s) / 100;
  });

  text.value(0);
  text.on('change', function(e) {
    var pct = e.value;
    slider.pct(toSliderPct(pct));
    onchange(pct);
  });

  function toSliderPct(p) {
    p = Math.sqrt(p);
    var pct = 1 - p;
    return pct;
  }

  function fromSliderPct(p) {
    var pct = 1 - p;
    return pct * pct;
  }

  function onchange(val) {
    if (_value != val) {
      _value = val;
      control.dispatchEvent('change', {value:val});
    }
  }


  var control = new EventDispatcher();
  control.value = function(val) {
    if (!isNaN(val)) {
      // TODO: validate
      _value = val;
      slider.pct(toSliderPct(val));
      text.value(val);
    }
    return _value;
  };

  // init components
  control.value(_value);

  return control;
}

function ImportPanel(callback) {

  var shpBtn = new FileChooser('#g-shp-import-btn');
  shpBtn.on('select', function(e) {
    var reader = new FileReader(),
        file = e.file;
    reader.onload = function(e) {
      var shpData = MapShaper.importShp(reader.result);
      var opts = {
        input_file: file.name,
        keep_shapes: El("#g-import-retain-opt").el.checked,
        simplify_method: 'mod'
      };
      El("#mshp-intro-screen").hide();
      callback(shpData, opts)
    };
    reader.readAsArrayBuffer(file);
  })

  shpBtn.validator(function(file) {
    return /.shp$/.test(file.name);
  });

  // var nextBtn = new SimpleButton("#mshp-import .g-next-btn").active(false);
  // var cancelBtn = new SimpleButton("#g-import-panel .g-cancel-btn").active(false).on('click', cancel, this);
}

Opts.inherit(ImportPanel, EventDispatcher);


var controls = {
  Slider: Slider,
  Checkbox: Checkbox,
  SimplifyControl: SimplifyControl,
  ImportPanel: ImportPanel
};

