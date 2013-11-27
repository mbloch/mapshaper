/* @requires mapshaper-import, mapshaper-data-table, mapshaper-crs */

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
  var self = this,
      dropper = DropControl(this),
      chooser = new FileChooser('#g-shp-import-btn').on('select', function(e) {
        self.readFiles(e.files);
      });

  var precisionInput = new ClickText("#g-import-precision-opt")
    .bounds(0, Infinity)
    .formatter(function(str) {
      var val = parseFloat(str);
      return !val ? '' : String(val);
    })
    .validator(function(str) {
      return str === '' || Utils.isNumber(parseFloat(str));
    });

  // TODO: doesn't need to be public
  // Receive: FileList
  this.readFiles = function(files) {
    Utils.forEach(files, this.readFile, this);
  };

  // Receive: File object
  this.readFile = function(file) {
    var name = file.name,
        info = MapShaper.parseLocalPath(name),
        type = MapShaper.guessFileType(name),
        reader;
    if (type) {
      reader = new FileReader();
      reader.onload = function(e) {
        inputFileContent(name, type, reader.result);
      };
      if (type == 'shp' || type == 'dbf') {
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

  // Index of imported objects, indexed by path base and then file type
  // e.g. {"shapefiles/states": {"dbf": [obj], "shp": [obj]}}
  var fileIndex = {}; //
  function inputFileContent(path, type, content) {
    var fileInfo = MapShaper.parseLocalPath(path),
        pathbase = fileInfo.pathbase,
        fname = fileInfo.filename,
        index = fileIndex[pathbase],
        data;

    if (!index) {
      index = fileIndex[pathbase] = {};
    }
    if (type in index) {
      // TODO: improve; this can cause false conflicts,
      // e.g. states.json and states.topojson
      trace("inputFileContent() File has already been imported; skipping:", fname);
      return;
    }
    if (type == 'shp' || type == 'json') {
      var opts = {
        debug_snapping: false,
        input_file: fname,
        precision: precisionInput.value(),
        snapping: !!El("#g-snap-points-opt").node().checked
      };
      T.start("Start timing");
      data = MapShaper.importContent(content, type, opts);
      editor.addData(data, opts);
      T.stop("Done importing");
    } else if (type == 'dbf') {
      data = new ShapefileTable(content);
      // TODO: validate table (check that record count matches, etc)
      if ('shp' in index) {
        index.shp.layers[0].data = data;
      }
    } else {
      return; // ignore unsupported files
      // error("inputFileContent() Unexpected file type:", path);
    }

    // TODO: accept .prj files
    if (type == 'prj') {
      error("inputFileContent() .prj files not supported (yet)");
      data = new ShapefileCRS(content);
      if ('shp' in index) {
        index.shp.crs = data;
      }
    }

    // associate previously imported Shapefile files with a .shp file
    if (type == 'shp') {
      if ('dbf' in index) {
        data.layers[0].data = index.dbf;
      }
      if ('prj' in index) {
        data.crs = index.prj;
      }
    }

    index[type] = data;
  }
}

Opts.inherit(ImportControl, EventDispatcher);
