/* @require mapshaper-elements, textutils, mapshaper-shapefile */


var ExportControl = function(arcData, topoData) {
  var filename = "out";

  var el = El('#g-export-control').show();
  var anchor = el.newChild('a').attr('href', '#').node();
  var btn = new SimpleButton('#g-export-control .g-next-btn').active(true);

  btn.on('click', function() {
    btn.active(false);
    exportShapefileToZip();
    return false;
  });

  function exportBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = filename;
    var clickEvent = document.createEvent("MouseEvent");
    clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    anchor.dispatchEvent(clickEvent);
    btn.active(true);
  }

  function exportTopoJSON() {

  }

  function exportShapefileToZip() {
    var data = exportShapefile();
    var shp = new Blob([data.shp]);
    var shx = new Blob([data.shx]);
    trace(shp.size, data.shp.byteLength);

    function addShp(writer) {
      writer.add(filename + ".shp", new zip.BlobReader(shp), function() {
        addShx(writer);
      }, null); // last arg: onprogress
    }

    function addShx(writer) {
      writer.add(filename + ".shx", new zip.BlobReader(shx), function() {
        writer.close(function(blob) {
          exportBlob(filename + ".zip", blob)
        });
      });
    }

    zip.createWriter(new zip.BlobWriter("application/zip"), addShp, error);
  }

  function exportShapefile() {
    var arcs = [];
    arcData.shapes().forEach(function(iter) {
      var xx = [], yy = [];
      while(iter.hasNext()) {
        xx.push(iter.x);
        yy.push(iter.y);
      }
      arcs.push([xx, yy]);
    });

    return MapShaper.exportShp(arcs, topoData.shapes, 5);
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
  var shpFile,
      shpData;

  var shpBtn = new FileChooser('#g-shp-import-btn');
  shpBtn.on('select', function(e) {
    var reader = new FileReader();
    reader.onload = function(e) {
      shpFile = e.file;
      shpData = MapShaper.importShp(reader.result);
      trace(Utils.getKeys(shpData), shpData.info)
      // El("#g-import-options").show();
      // nextBtn.active(true).on('click', next, this);
      next();
    };
    reader.readAsArrayBuffer(e.file);
  })

  shpBtn.validator(function(file) {
    return /.shp$/.test(file.name);
  });

  var nextBtn = new SimpleButton("#mshp-import .g-next-btn").active(false);
  // var cancelBtn = new SimpleButton("#g-import-panel .g-cancel-btn").active(false).on('click', cancel, this);

  function next() {
    El("#mshp-intro-screen").hide();
    callback && shpData && callback(shpData, getImportOpts())
  }


  function getImportOpts() {
    var opts = {
      simplify_method: 'mod',
      use_sphere: El("#g-import-spherical-opt").el.checked,
      keep_shapes: El("#g-import-retain-opt").el.checked
    };

    return opts;
  }
}

Opts.inherit(ImportPanel, EventDispatcher);


var controls = {
  Slider: Slider,
  Checkbox: Checkbox,
  SimplifyControl: SimplifyControl,
  ImportPanel: ImportPanel
};

