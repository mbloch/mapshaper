/* @require mapshaper-elements, textutils, mapshaper-shapefile */

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
      reader.readAsArrayBuffer(file);
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
    /* else if (/json$/.test(name)) { // accept .json, .geojson, .topojson
      return 'json';
    } */
    return '';
  }

  function inputFileContent(path, type, buf) {
    var fileInfo = MapShaper.parseLocalPath(path),
        fname = fileInfo.filename,
        data;

    var opts = {
      input_file: fname
    };

    if (type == 'shapefile') {
      data = MapShaper.importShp(buf);
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

var controls = {
  Slider: Slider,
  Checkbox: Checkbox,
  SimplifyControl: SimplifyControl,
};
