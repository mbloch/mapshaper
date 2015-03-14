/* @requires mapshaper-import, mapshaper-data-table */

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
      return str === '' || utils.isNumber(parseFloat(str));
    });

  // TODO: doesn't need to be public
  // Receive: FileList
  this.readFiles = function(files) {
    utils.forEach(files, this.readFile, this);
  };

  // Receive: File object
  this.readFile = function(file) {
    var name = file.name,
        fmt = MapShaper.guessInputFileFormat(name),
        reader = new FileReader();
    reader.onload = function(e) {
      inputFileContent(name, reader.result);
    };
    if (MapShaper.isBinaryFile(name)) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  };

  // Index of imported objects, indexed by path base and then file type
  // e.g. {"shapefiles/states": {"dbf": [obj], "shp": [obj]}}
  var fileIndex = {}; //
  function inputFileContent(path, content) {
    var fileInfo = utils.parseLocalPath(path),
        pathbase = fileInfo.pathbase,
        ext = fileInfo.extension.toLowerCase(),
        fname = fileInfo.filename,
        index = fileIndex[pathbase],
        data;

    if (!index) {
      index = fileIndex[pathbase] = {};
    }
    if (ext in index) {
      verbose("inputFileContent() File has already been imported; skipping:", fname);
      return;
    }
    if (ext == 'shp' || /json$/.test(ext)) {
      var opts = {
        files: [fname],
        precision: precisionInput.value(),
        auto_snap: !!El("#g-snap-points-opt").node().checked
      };
      T.start("Start timing");
      data = MapShaper.importFileContent(content, path, opts);
      MapShaper.setLayerName(data.layers[0], fname);
      editor.addData(data, opts);
      T.stop("Done importing");

    } else if (ext == 'dbf') {
      data = new ShapefileTable(content);
      // TODO: validate table (check that record count matches, etc)
      if ('shp' in index) {
        index.shp.layers[0].data = data;
      }
    } else {
      return; // ignore unsupported files
      // error("inputFileContent() Unexpected file type:", path);
    }

    // associate previously imported Shapefile files with a .shp file
    // TODO: accept .prj files and other Shapefile files
    if (ext == 'shp') {
      if ('dbf' in index) {
        data.layers[0].data = index.dbf;
      }
    }

    index[ext] = data;
  }
}

Opts.inherit(ImportControl, EventDispatcher);
