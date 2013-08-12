/* @require mapshaper-elements, mapshaper-shapefile, mapshaper-geojson, mapshaper-topojson */

function DropControl(importer) {
  var el = El('#page-wrapper');
  el.on('dragleave', ondrag);
  el.on('dragover', ondrag);
  el.on('drop', ondrop);

  function ondrag(e) {
    // blocking drag events enables drop event
    e.preventDefault();
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
      };
      if (type == 'shp') {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file, 'UTF-8');
      }
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
      return 'shp';
    }
    else if (/json$/.test(name)) { // accept .json, .geojson, .topojson
      return 'json';
    }
    return '';
  }

  function inputFileContent(path, type, content) {
    var fileInfo = MapShaper.parseLocalPath(path),
        fname = fileInfo.filename,
        data = MapShaper.importContent(content, type);

    var opts = {
      input_file: fname
    };
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
};


// Export buttons and their behavior
//
var ExportControl = function(arcData, layers, fileBase) {

  El('#g-export-control').show();
  if (typeof URL == 'undefined' || !URL.createObjectURL) {
    El('#g-export-control .g-label').text("Exporting is not supported in this browser");
    return;
  }

  var anchor = El('#g-export-control').newChild('a').attr('href', '#').node(),
      blobUrl;

  El('#g-export-buttons').css('display:inline');

  var geoBtn = exportButton("#g-geojson-btn", "geojson"),
      shpBtn = exportButton("#g-shapefile-btn", "shapefile"),
      topoBtn = exportButton("#g-topojson-btn", "topojson");

  function exportButton(selector, format) {

    function onClick(e) {
      btn.active(false);
      setTimeout(function() {
        exportAs(format, function() {
          btn.active(true);
        });
      }, 10);
    }

    var btn = new SimpleButton(selector).active(true).on('click', onClick);
    return btn;
  }

  function exportAs(format, done) {
    var opts = {
          output_format: format,
          output_file_base: fileBase,
          output_extension: MapShaper.getDefaultFileExtension(format)
        },
        files = MapShaper.exportContent(layers, arcData, opts),
        file;
    if (!Utils.isArray(files) || files.length === 0) {
      error("exportAs() Export failed.");
    } else if (files.length == 1) {
      file = files[0];
      saveBlob(file.filename, new Blob([file.content]));
      done();
    } else {
      saveZipFile((fileBase  || "out") + ".zip", files, done);
    }
  }

  function saveBlob(filename, blob) {
    try {
      // revoke previous download url, if any. TODO: do this when download completes (how?)
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob);
    } catch(e) {
      alert("Mapshaper can't export files from this browser. Try switching to Chrome or Firefox.");
      return;
    }

    anchor.href = blobUrl;
    anchor.download = filename;
    var clickEvent = document.createEvent("MouseEvent");
    clickEvent.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, false,
        false, false, false, 0, null);
    anchor.dispatchEvent(clickEvent);
  }

  function saveZipFile(zipfileName, files, done) {
    var toAdd = files;
    try {
      zip.createWriter(new zip.BlobWriter("application/zip"), addFile, zipError);
    } catch(e) {
      if (Utils.parseUrl(Browser.getPageUrl()).protocol == 'file') {
        alert("This browser doesn't support offline .zip file creation.");
      } else {
        alert("This browser doesn't support .zip file creation.");
      }
    }

    function zipError(msg) {
      error(msg);
    }

    function addFile(archive) {
      if (toAdd.length === 0) {
        archive.close(function(blob) {
          saveBlob(zipfileName, blob);
          done();
        });
      } else {
        var obj = toAdd.pop(),
            blob = new Blob([obj.content]);
        archive.add(obj.filename, new zip.BlobReader(blob), function() {addFile(archive);});
      }
    }
  }

  /*
  function blobToDataURL(blob, cb) {
    var reader = new FileReader();
    reader.onload = function() {
      cb(reader.result);
    };
    reader.readAsDataURL(blob);
  }
  */
};


var controls = {
  Slider: Slider,
  Checkbox: Checkbox,
  SimplifyControl: SimplifyControl,
  ExportControl: ExportControl
};
