/* @requires
mapshaper-data-table
mapshaper-gui-import
mapshaper-zip-reader
*/

// @cb function(<FileList>)
function DropControl(cb) {
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
    cb(e.dataTransfer.files);
  }
}

// @el DOM element for select button
// @cb function(<FileList>)
function FileChooser(el, cb) {
  var btn = El(el).on('click', function() {
    input.el.click();
  });
  var input = El('form')
    .addClass('g-file-control').appendTo('body')
    .newChild('input')
    .attr('type', 'file')
    .attr('multiple', 'multiple')
    .on('change', onchange);

  function onchange(e) {
    var files = e.target.files;
    // files may be undefined (e.g. if user presses 'cancel' after a file has been selected)
    if (files) {
      // disable the button while files are being processed
      btn.addClass('selected');
      input.attr('disabled', true);
      cb(files);
      btn.removeClass('selected');
      input.attr('disabled', false);
    }
  }
}

function ImportControl(model) {
  var precisionInput;
  El('#mshp-import').show(); // show import screen
  new DropControl(readFiles);
  new FileChooser('#g-shp-import-btn', readFiles);
  precisionInput = new ClickText("#g-import-precision-opt")
    .bounds(0, Infinity)
    .formatter(function(str) {
      var val = parseFloat(str);
      return !val ? '' : String(val);
    })
    .validator(function(str) {
      return str === '' || utils.isNumber(parseFloat(str));
    });

  function readFiles(files) {
    utils.forEach((files || []), readFile);
  }

  function getImportOpts() {
    var method = El('#g-simplification-menu input[name=method]:checked').attr('value') || null;
    return {
      method: method,
      no_repair: !El("#g-repair-intersections-opt").node().checked,
      keep_shapes: !!El("#g-import-retain-opt").node().checked,
      auto_snap: !!El("#g-snap-points-opt").node().checked,
      precision: precisionInput.value()
    };
  }

  function importFile(file) {
    var opts = getImportOpts();
    gui.importFile(file, opts, function(err, dataset) {
      if (dataset) {
        model.setEditingLayer(dataset.layers[0], dataset, opts);
      }
    });
  }

  // @file a File object
  function readFile(file) {
    var name = file.name,
        ext = utils.getFileExtension(name).toLowerCase();
    if (ext == 'zip') {
      gui.readZipFile(file, function(err, files) {
        if (err) {
          console.log("Zip file loading failed:");
          throw err;
        }
        readFiles(files);
      });
    } else if (gui.isReadableFileType(name)) {
      importFile(file);
    } else {
      console.log("File can't be imported:", name, "-- skipping.");
    }
  }
}
