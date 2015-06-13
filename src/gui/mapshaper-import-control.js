/* @requires mapshaper-import, mapshaper-data-table, mapshaper-gui-lib */

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
    utils.forEach((files || []), this.readFile, this);
  };

  // Receive: File object
  this.readFile = function(file) {
    var name = file.name,
        ext = utils.getFileExtension(name).toLowerCase(),
        isBinary = MapShaper.isBinaryFile(name),
        reader;

    if (ext == 'zip') {
      readZipFile(file);
    } else if (gui.isReadableFileType(name)) {
      reader = new FileReader();
      reader.onload = function(e) {
        inputFileContent(name, reader.result);
      };
      // TODO: improve to handle encodings, etc.
      if (isBinary) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file, 'UTF-8');
      }
    } else {
      console.log("File can't be imported:", name, "-- skipping.");
    }
  };

  function importZipContent(reader) {
    var _entries;
    reader.getEntries(readEntries);

    function readEntries(entries) {
      _entries = entries;
      readNext();
    }

    function readNext() {
      if (_entries.length > 0) {
        readEntry(_entries.pop());
      } else {
        reader.close();
      }
    }

    function readEntry(entry) {
      var filename = entry.filename;
      if (!entry.directory && gui.isReadableFileType(filename)) {
        entry.getData(new zip.BlobWriter(), function(data) {
          data.name = filename;
          self.readFile(data);
          readNext();
        });
      } else {
        readNext();
      }
    }
  }

  function readZipFile(file) {
    zip.createReader(new zip.BlobReader(file), importZipContent, onError);
    function onError(err) {
      throw err;
    }
  }

  var getImportDataset = (function() {
    var fileIndex = {}; //
    return function(basename) {
      var dataset = fileIndex[basename];
      if (!dataset) {
        dataset = fileIndex[basename] = {
          info: {}
        };
      }
      return dataset;
    };
  }());

  function mergeImportDataset(dest, src) {
    if (!dest.layers) {
      dest.layers = src.layers;
    } else if (dest.layers.length == 1 && src.layers.length == 1) {
      utils.extend(dest.layers[0], src.layers[0]);
      // TODO: check that attributes and shapes are compatible
    } else {
      error("Import files contain incompatible data layers");
    }

    if (!dest.arcs) {
      dest.arcs = src.arcs;
    } else if (src.arcs) {
      error("Import files contain incompatible arc data");
    }
    utils.extend(dest.info, src.info);
  }

  // Index of imported objects, indexed by path base and then file type
  // e.g. {"shapefiles/states": {"dbf": [obj], "shp": [obj]}}
  function inputFileContent(path, content) {
    var dataset = getImportDataset(utils.getFileBase(path)),
        type = MapShaper.guessInputFileType(path),
        inputOpts, input;

    if (type == 'shp' || type == 'json') {
      if (dataset.info.editing) {
        console.log("Editing has started; ignoring file:", path);
        return;
      }
      dataset.info.editing = true;
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
      mergeImportDataset(dataset, MapShaper.importContent(input, inputOpts));
      editor.addData(dataset, inputOpts);

    } else if (type == 'dbf') {
      // TODO: detect dbf encoding instead of using ascii
      // (Currently, records are read if Shapefile is converted to *JSON).
      // TODO: validate table (check that record count matches, etc)
      mergeImportDataset(dataset, {
        layers: [{data: new ShapefileTable(content, 'ascii')}]
      });

    } else if (type == 'prj') {
      dataset.info.output_prj = content;

    } else {
      console.log("Unexpected file type: " + path + '; ignoring');
    }
  }
}

Opts.inherit(ImportControl, EventDispatcher);
