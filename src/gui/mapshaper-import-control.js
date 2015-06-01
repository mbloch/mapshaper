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
    (files || []).forEach(this.readFile, this);
  };

  // Receive: File object
  this.readFile = function(file) {
    var name = file.name,
        isBinary = MapShaper.isBinaryFile(name),
        reader = new FileReader();
    reader.onload = function(e) {
      inputFileContent(name, reader.result);
    };
    if (isBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  };

  // Index of imported objects, indexed by path base and then file type
  // e.g. {"shapefiles/states": {"dbf": [obj], "shp": [obj]}}
  var fileIndex = {}; //
  function inputFileContent(path, content) {
    var basename = utils.getFileBase(path),
        index = fileIndex[basename] || (fileIndex[basename] = {}),
        type = MapShaper.guessInputFileType(path),
        inputOpts, input, data;

    if (index[type]) {
      verbose("File has already been imported; skipping:", path);
      return;
    }
    if (type == 'shp' || type == 'json') {
      T.start("Start timing");
      inputOpts = {
        files: [path],
        precision: precisionInput.value(),
        auto_snap: !!El("#g-snap-points-opt").node().checked
      };
      input = {};
      input[type] = {
        content: content,
        filename: path
      };
      data = MapShaper.importContent(input, inputOpts);
      editor.addData(data, inputOpts);
      T.stop("Done importing");
    } else if (type == 'dbf') {
      // TODO: detect dbf encoding instead of using ascii
      // (Currently, records are read if Shapefile is converted to *JSON).
      data = new ShapefileTable(content, 'ascii');
      // TODO: validate table (check that record count matches, etc)
      if (index.shp) {
        index.shp.layers[0].data = data;
      }
    } else {
      verbose("Unexpected file type: " + path + '; ignoring');
      return;
    }

    // associate previously imported Shapefile files with a .shp file
    // TODO: accept .prj files and other Shapefile files
    if (type == 'shp' && index.dbf) {
      data.layers[0].data = index.dbf;
    }
    index[type] = data;
  }
}

Opts.inherit(ImportControl, EventDispatcher);
