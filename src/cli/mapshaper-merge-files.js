/* @require mapshaper-file-import, mapshaper-path-import */

// receive array of options for files to import
// return merged file data
// TODO: remove duplication with single-file import
//
MapShaper.mergeFiles = function(files, opts, separateLayers) {
  var first, geometries, layerNames;
  if (separateLayers) {
    layerNames = MapShaper.getLayerNames(files);
  }

  geometries = Utils.map(files, function(fname, i) {
    var fileType = MapShaper.guessFileType(fname),
        content = MapShaper.readGeometryFile(fname, fileType),
        importData = MapShaper.importFileContent(content, fileType, opts),
        fmt = importData.info.input_format;

    if (fileType == 'shp' && !importData.data) {
      importData.data = MapShaper.importDbfTable(fname, opts.encoding);
    }

    if (fmt != 'geojson' && fmt != 'shapefile') {
      error("[merge files] Incompatible file format:", fmt);
    }

    if (first && fmt != first.info.input_format) {
      error("[merge files] Found mixed file formats:", first.info.input_format, "and", fmt);
    }

    if (separateLayers) {
      // kludge: need a data table in order to add layer name
      if (!importData.data) {
        importData.data = new DataTable(importData.info.input_shape_count);
      }
      importData.data.addField("__LAYER", layerNames[i]);
    }

    if (!first) {
      first = importData;
    } else {
      if (first.data) {
        MapShaper.extendDataTable(first.data, importData.data, !separateLayers);
      }
      var shapeCount = MapShaper.extendPathData(first.geometry.validPaths,
          first.info.input_shape_count,
          importData.geometry.validPaths, importData.info.input_shape_count);
      first.info.input_shape_count = shapeCount;
      // TODO: combine other info fields (e.g. input_point_count)
    }

    return importData.geometry;
  });

  var coords = MapShaper.mergeArcData(geometries);
  Utils.extend(first.geometry, coords); // replace xx, yy, nn

  var topology = MapShaper.importPaths(first, true);
  if (separateLayers) {
    topology.layers = MapShaper.splitLayersOnField(topology.layers, topology.arcs, "__LAYER");
    // remove temp property
    topology.layers.forEach(function(lyr) {
      lyr.data.deleteField('__LAYER');
    });
  }

  topology.info = first.info;
  topology.info.input_files = files;
  return topology;
};


MapShaper.getLayerNames = function(paths) {
  // default names: filenames without the extension
  var names = paths.map(function(path) {
    return MapShaper.parseLocalPath(path).basename;
  });

  // remove common prefix, if any
  var prefix = MapShaper.getCommonFilePrefix(names);
  if (prefix && !Utils.contains(names, prefix)) {
    names = names.map(function(name) {
      return Utils.lreplace(name, prefix);
    });
  }

  return MapShaper.getUniqueLayerNames(names);
};

MapShaper.getFileSuffix = function(filebase, prefix) {
  if (filebase.indexOf(prefix) === 0) {
    return filebase.substr(prefix.length);
  }
  return filebase;
};

MapShaper.getCommonFilePrefix = function(files) {
  return Utils.reduce(files, function(prefix, file) {
    var filebase = Node.getFileInfo(file).base;
    if (prefix !== null) {
      filebase = MapShaper.findStringPrefix(prefix, filebase);
    }
    return filebase;
  }, null);
};

// @see mapshaper script
//
MapShaper.getMergedFileBase = function(arr, suffix) {
  var basename = MapShaper.getCommonFilePrefix(arr);
  basename = basename.replace(/[-_ ]+$/, '');
  if (suffix) {
    basename = basename ? basename + '-' + suffix : suffix;
  }
  return basename;
};

MapShaper.findStringPrefix = function(a, b) {
  var i = 0;
  for (var n=a.length; i<n; i++) {
    if (a[i] !== b[i]) break;
  }
  return a.substr(0, i);
};

// Concatenate arc data contained in an
// array of objects.
//
MapShaper.mergeArcData = function(arr) {
  return {
    xx: MapShaper.mergeArrays(Utils.pluck(arr, 'xx'), Float64Array),
    yy: MapShaper.mergeArrays(Utils.pluck(arr, 'yy'), Float64Array),
    nn: MapShaper.mergeArrays(Utils.pluck(arr, 'nn'), Int32Array)
  };
};

MapShaper.countElements = function(arrays) {
  var c = 0;
  for (var i=0; i<arrays.length; i++) {
    c += arrays[i].length || 0;
  }
  return c;
};

MapShaper.mergeArrays = function(arrays, TypedArr) {
  var size = MapShaper.countElements(arrays),
      Arr = TypedArr || Array,
      merged = new Arr(size),
      offs = 0;
  Utils.forEach(arrays, function(src) {
    var n = src.length;
    for (var i = 0; i<n; i++) {
      merged[i + offs] = src[i];
    }
    offs += n;
  });
  return merged;
};

MapShaper.extendPathData = function(dest, destCount, src, srcCount) {
  var path;
  for (var i=0, n=src.length; i<n; i++) {
    path = src[i];
    path.shapeId += destCount;
    dest.push(path);
  }
  return destCount + srcCount;
};

MapShaper.extendDataTable = function(dest, src, validateFields) {
  if (src.size() > 0) {
    if (dest.size() > 0 && validateFields) {
      // both tables have records: make sure fields match
      var destFields = dest.getFields(),
          srcFields = src.getFields();
      if (destFields.length != srcFields.length ||
          Utils.difference(destFields, srcFields).length > 0) {
        // TODO: stop the program without printing entire call stack
        error("Merged files have different fields");
      }
    }
    Utils.merge(dest.getRecords(), src.getRecords());
  }
  return dest;
};
