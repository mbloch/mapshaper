/* @requires mapshaper-geojson, mapshaper-topojson, mapshaper-shapefile */


MapShaper.getDefaultFileExtension = function(fileType) {
  var ext = "";
  if (fileType == 'shapefile') {
    ext = 'shp';
  } else if (fileType == 'geojson' || fileType == 'topojson') {
    ext = "json";
  }
  return ext;
};

// Return an array of objects with "filename" "filebase" "extension" and "content" attributes.
//
MapShaper.exportContent = function(layers, arcData, opts) {
  var exporter = MapShaper.exporters[opts.output_format];
  if (!exporter) error("exportContent() Unknown export format:", opts.output_format);
  if (!opts.output_extension) opts.output_extension = MapShaper.getDefaultFileExtension(opts.output_format);
  if (!opts.output_file_base) opts.output_file_base = "out";

  validateLayerData(layers);
  T.start();
  var files = exporter(layers, arcData, opts);
  T.stop("Export " + opts.output_format);

  assignFileNames(files, opts);
  return files;

  function validateLayerData(layers) {
    Utils.forEach(layers, function(lyr) {
      if (!Utils.isArray(lyr.shapes)) {
        error ("#exportContent() A layer is missing shape data");
      }
      if (lyr.geometry_type != 'polygon' && lyr.geometry_type != 'polyline') {
        error ("#exportContent() A layer is missing a valid geometry type");
      }
    });
  }

  function assignFileNames(files, opts) {
    var index = {};
    Utils.forEach(files, function(file) {
      file.extension = file.extension || opts.output_extension;
      var name = opts.output_file_base,
          i = 1,
          filebase, filename, ext;
      if (file.name) {
        name += "-" + file.name;
      }
      do {
        filebase = name;
        if (i > 1) {
          filebase = filebase + String(i);
        }
        filename = filebase + '.' + file.extension;
        i++;
      } while (filename in index);

      index[filename] = true;
      file.filebase = filebase;
      file.filename = filename;
    });
  }
};

MapShaper.exporters = {
  geojson: MapShaper.exportGeoJSON,
  topojson: MapShaper.exportTopoJSON,
  shapefile: MapShaper.exportShp
};

MapShaper.PathExporter = PathExporter; // for testing

// Convert topological data into formats that are useful for exporting
// Shapefile, GeoJSON and TopoJSON
//
function PathExporter(arcData, polygonType) {
  var layerBounds = new Bounds();
  if (polygonType !== true && polygonType !== false)
    error("PathExporter requires boolean @polygonType parameter.");

  this.getBounds = function() {
    return layerBounds;
  };

  // Export data for serializing one Shapefile record
  //
  this.exportShapeForShapefile = function(ids) {
    var bounds = new Bounds();
    var data = exportShapeData(ids);
    var paths = Utils.map(data.pathData, function(path) {
      bounds.mergeBounds(path.bounds);
      return [path.xx, path.yy];
    });
    return {
      bounds: bounds,
      pointCount: data.pointCount,
      paths: paths,
      pathCount: paths.length
    };
  };

  // Export path coordinates for one Shape/Feature, either nested like a
  // GeoJSON MultiPolygon or like a GeoJSON MultiLineString
  //
  this.exportShapeForGeoJSON = function(ids) {
    var obj = exportShapeData(ids);
    if (obj.pointCount === 0) return null;
    if (polygonType) {
      var groups = groupMultiPolygonPaths(obj.pathData);
      return Utils.map(groups, function(group) {
        return convertPathsForGeoJSON(group);
      });
    } else {
      return convertPathsForGeoJSON(obj.pathData);
    }
  };

  // Export arrays of arc ids for the "arcs" parameter of a TopoJSON "object"
  //
  this.exportShapeForTopoJSON = function(ids) {
    var obj = exportShapeData(ids);
    if (obj.pointCount === 0) return null;
    if (polygonType) {
      var groups = groupMultiPolygonPaths(obj.pathData);
      return Utils.map(groups, function(group) {
        return convertPathsForTopoJSON(group);
      });
    } else {
      return convertPathsForTopoJSON(obj.pathData);
    }
  };

  function convertPathsForGeoJSON(paths) {
    return Utils.map(paths, function(path) {
      return MapShaper.transposeXYCoords(path.xx, path.yy);
    });
  }

  function convertPathsForTopoJSON(paths) {
    return Utils.map(paths, function(path) {
      return path.ids;
    });
  }

  // Bundle holes with their containing rings, for Topo/GeoJSON export
  // Assume positive rings are CCW and negative rings are CW, like Shapefile
  // @paths array of path objects from exportShapeData()
  //
  function groupMultiPolygonPaths(paths) {
    var pos = [],
        neg = [];
    Utils.forEach(paths, function(path) {
      if (path.area > 0) {
        pos.push(path);
      } else if (path.area < 0) {
        neg.push(path);
      } else {
        // trace("Zero-area ring, skipping")
      }
    });

    var output = Utils.map(pos, function(part) {
      return [part];
    });

    Utils.forEach(neg, function(hole) {
      var containerId = -1,
          containerArea = 0;
      for (var i=0, n=pos.length; i<n; i++) {
        var part = pos[i],
            contained = part.bounds.contains(hole.bounds);
        if (contained && (containerArea === 0 || part.area < containerArea)) {
          containerArea = part.area;
          containerId = i;
        }
      }
      if (containerId == -1) {
        trace("#groupMultiShapePaths() polygon hole is missing a containing ring, dropping.");
        // trace(paths)
      } else {
        output[containerId].push(hole);
      }
    });
    return output;
  }

  //
  //
  function exportShapeData(ids) {
    var pointCount = 0,
        pathData = [],
        path,
        shp;

    if (ids && ids.length > 0) { // may be null
      shp = arcData.getMultiPathShape(ids);
      for (var i=0; i<shp.pathCount; i++) {
        path = convertPath(shp.getPath(i), polygonType);
        if (path) {
          pathData.push(path);
          pointCount += path.pointCount;
        }
      }
    }
    return {
      pointCount: pointCount,
      pathData: pathData
    };
  }

  // Extract data from a SimpleShape object (see mapshaper-shapes.js)
  // Returns null if shape has collapsed or is otherwise invalid
  //
  function convertPath(path, isRing) {
    var xx = [],
        yy = [],
        iter = path.getPathIter();

    var x, y, prevX, prevY,
        bounds,
        i = 0,
        area = 0;
    while (iter.hasNext()) {
      x = iter.x;
      y = iter.y;

      if (i === 0 || prevX != x || prevY != y) {
        xx.push(x);
        yy.push(y);
        i++;
      }

      prevX = x;
      prevY = y;
    }

    if (isRing) {
      area = msSignedRingArea(xx, yy);
      if (i < 4 || area === 0) return null;
    } else if (i < 2) {
      return null;
    }

    bounds = MapShaper.calcXYBounds(xx, yy);
    layerBounds.mergeBounds(bounds); // KLUDGE: simpler to accumulate bounds here

    return {
      xx: xx,
      yy: yy,
      pointCount: xx.length,
      area: area,
      ids: path.ids,
      bounds: bounds
    };
  }
}
