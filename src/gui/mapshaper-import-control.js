/* @requires mapshaper-import */

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
