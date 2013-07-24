/* @require mapshaper-elements, mapshaper-shapefile, mapshaper-geojson, mapshaper-topojson */

function DropControl(importer) {
  var el = El('body');
  el.on('dragenter', ondrag);
  el.on('dragexit', ondrag);
  el.on('dragover', ondrag);
  el.on('drop', ondrop);

  function ondrag(e) {
    // blocking drag events enables drop event
    e.preventDefault();
    e.stopPropagation();
  }

  function ondrop(e) {
    e.preventDefault();
    importer.readFiles(e.dataTransfer.files);
  }
}

function ImportControl(editor) {
  // Receive: FileList
  this.readFiles = function(files) {
    Utils.forEach(files, this.readFile, this);
  };

  // Receive: File object
  this.readFile = function(file) {
    var name = file.name,
        type = guessFileType(name),
        reader;
    if (type) {
      reader = new FileReader();
      reader.onload = function(e) {
        inputFileContent(name, type, reader.result);
      }
      type == 'shapefile' ? reader.readAsArrayBuffer(file) : reader.readAsText(file, 'UTF-8');
    }
  };

  this.loadFile = function(path) {
    var type = guessFileType(path);
    if (type) {
      Utils.loadBinaryData(path, function(buf) {
        inputFileContent(path, type, buf);
      });
    }
  };

  function guessFileType(name) {
    if (/\.shp$/.test(name)) {
      return 'shapefile';
    }
    else if (/json$/.test(name)) { // accept .json, .geojson, .topojson
      return 'json';
    }
    return '';
  }

  function inputFileContent(path, type, content) {
    var fileInfo = MapShaper.parseLocalPath(path),
        fname = fileInfo.filename,
        data;

    var opts = {
      input_file: fname
    };


    if (type == 'shapefile') {
      data = MapShaper.importShp(content);
    } else if (type == 'json') {
      data = MapShaper.importJSON(JSON.parse(content));
    } else {
      error("Unsupported file type:", fname);
    }
    editor.addData(data, opts);
  }
}

Opts.inherit(ImportControl, EventDispatcher);

var SimplifyControl = function() {
  var _value = 1;
  El('#g-simplify-control').show();
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

  control.value(_value);
  return control;
}


// Export buttons and their behavior
//
var ExportControl = function(arcData, topoData, opts) {

  if (opts.geometry != 'polygon' && opts.geometry != 'polyline') {
    error("ExportControl() unexpected geometry type:", opts.geometry);
  }
  El('#g-export-control').show();
  if (typeof URL == 'undefined' || !URL.createObjectURL) {
    El('#g-export-control .g-label').text("Exporting is not supported in this browser");
    return;
  }

  var filename = opts && opts.output_name || "out",
      anchor = El('#g-export-control').newChild('a').attr('href', '#').node(),
      blobUrl;

  El('#g-export-buttons').css('display:inline');

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
    try {
      // revoke previous download url, if any. TODO: do this when download completes (how?)
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob);
    } catch(e) {
      alert("Mapshaper can't export files from this browser. Try switching to Chrome or Firefox.")
      return;
    }
    anchor.href = blobUrl;
    anchor.download = filename;
    var clickEvent = document.createEvent("MouseEvent");
    clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    anchor.dispatchEvent(clickEvent);
  }

  function exportGeoJSON() {
    var json = MapShaper.exportGeoJSON({shapes: topoData.shapes, arcs:arcData, type: opts.geometry, properties: opts.properties});
    exportBlob(filename + ".geojson", new Blob([json]));
    geoBtn.active(true);
  }

  function exportTopoJSON() {
    var polygons = {
      type: opts.geometry,
      name: opts.output_name || opts.geometry + 's', // 'polygons' or 'polylines'
      shapes: topoData.shapes
    };
    var json = MapShaper.exportTopoJSON({arcs:arcData, objects: [polygons], bounds: opts.bounds});
    exportBlob(filename + ".topojson", new Blob([json]));
    topoBtn.active(true);
  }

  function exportShapefile() {
    return MapShaper.exportShp({arcs: arcData, shapes: topoData.shapes, type: opts.geometry});
  }

  function exportZippedShapefile() {
    var data = exportShapefile(),
        shp = new Blob([data.shp]),
        shx = new Blob([data.shx]);

    function addReadMe(write) {

    }

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

    try {
      zip.createWriter(new zip.BlobWriter("application/zip"), addShp, error);
    } catch(e) {
      if (Utils.parseUrl(Browser.getPageUrl()).protocol == 'file') {
        alert("This browser doesn't support offline .zip file creation.");
      } else {
        alert("This browser doesn't support .zip file creation.");
      }
    }
  }

}


var controls = {
  Slider: Slider,
  Checkbox: Checkbox,
  SimplifyControl: SimplifyControl,
  ExportControl: ExportControl
};
