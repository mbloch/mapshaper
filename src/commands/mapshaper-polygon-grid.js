
api.polygonGrid = function(targetLayers, targetDataset, opts) {
  internal.requireProjectedDataset(targetDataset);
  var params = internal.getGridParams(targetLayers, targetDataset, opts);
  var geojson;
  if (params.type == 'square') {
    geojson = internal.getSquareGridGeoJSON(internal.getSquareGridCoordinates(params));
  } else if (params.type == 'hex') {
    geojson = internal.getHexGridGeoJSON(internal.getHexGridCoordinates(params));
  } else if (params.type == 'hex2') {
    // use rotated grid
    geojson = internal.getHexGridGeoJSON(internal.getHexGridCoordinates(internal.swapGridParams(params)));
    internal.swapPolygonCoords(geojson);
  } else {
    stop('Unsupported grid type');
  }
  internal.alignGridToBounds(geojson, params.bbox);
  var gridDataset = internal.importGeoJSON(geojson, {});
  gridDataset.info = targetDataset.info; // copy CRS to grid dataset // TODO: improve
  api.buildTopology(gridDataset);
  gridDataset.layers[0].name = opts.name || 'grid';
  if (opts.debug) gridDataset.layers.push(api.pointGrid2(targetLayers, targetDataset, opts));
  return gridDataset;
};

// TODO: Update -point-grid command to use this function
api.pointGrid2 = function(targetLayers, targetDataset, opts) {
  var params = internal.getGridParams(targetLayers, targetDataset, opts);
  var geojson;
  if (params.type == 'square') {
    geojson = internal.getPointGridGeoJSON(internal.getSquareGridCoordinates(params));
  } else if (params.type == 'hex') {
    geojson = internal.getPointGridGeoJSON(internal.getHexGridCoordinates(params));
  } else {
    stop('Unsupported grid type');
  }
  internal.alignGridToBounds(geojson, params.bbox);
  var gridDataset = internal.importGeoJSON(geojson, {});
  if (opts.name) gridDataset.layers[0].name = opts.name;
  return gridDataset.layers[0];
};

internal.swapGridParams = function(params) {
  var bbox = params.bbox;
  return utils.defaults({
    width: params.height,
    height: params.width,
    bbox: [bbox[1], bbox[0], bbox[3], bbox[2]]
  }, params);
};

internal.swapPolygonCoords = function(json) {
  json.geometries.forEach(function(geom) {
    geom.coordinates[0] = geom.coordinates[0].map(function(p) {
      return [p[1], p[0]];
    });
  });
};

internal.getGridParams = function(layers, dataset, opts) {
  var params = {};
  var crs = dataset ? internal.getDatasetCRS(dataset) : null;
  if (opts.interval) {
    params.interval = internal.convertIntervalParam(opts.interval, crs);
  } else {
    stop('Missing required interval option');
  }
  if (opts.bbox) {
    params.bbox = opts.bbox;
  } else if (dataset) {
    dataset = utils.defaults({layers: layers}, dataset);
    params.bbox = internal.getDatasetBounds(dataset).toArray();
  } else {
    stop('Missing grid bbox');
  }
  params.width = params.bbox[2] - params.bbox[0];
  params.height = params.bbox[3] - params.bbox[1];
  params.type = opts.type || 'square';
  return params;
};

internal.getPointGridGeoJSON = function(arr) {
  var geometries = [];
  arr.forEach(function(row) {
    row.forEach(function(xy) {
      geometries.push({
        type: 'Point',
        coordinates: xy
      });
    });
  });
  return {type: 'GeometryCollection', geometries: geometries};
};

internal.getHexGridGeoJSON = function(arr) {
  var geometries = [], a, b, c, d, e, f;
  var rows = arr.length - 2;
  var row, col, midOffset, evenRow;
  for (row = 0; row < rows; row++) {
    evenRow = row % 2 === 0;
    col = evenRow ? 0 : 2;
    midOffset = evenRow ? 0 : -1;
    for (; true; col += 3) {
      a = arr[row][col];
      b = arr[row + 1][col + midOffset]; // middle-left
      c = arr[row + 2][col];
      d = arr[row + 2][col + 1];
      e = arr[row + 1][col + 2 + midOffset]; // middle-right
      f = arr[row][col + 1];
      if (!d || !e) break; // end of row
      geometries.push({
        type: 'Polygon',
        coordinates: [[a, b, c, d, e, f, a]]
      });
    }
  }
  return {type: 'GeometryCollection', geometries: geometries};
};

internal.getSquareGridGeoJSON = function(arr) {
  var geometries = [], a, b, c, d;
  for (var row = 0, rows = arr.length - 1; row < rows; row++) {
    for (var col = 0, cols = arr[row].length - 1; col < cols; col++) {
      a = arr[row][col];
      b = arr[row + 1][col];
      c = arr[row + 1][col + 1];
      d = arr[row][col + 1];
      geometries.push({
        type: 'Polygon',
        coordinates: [[a, b, c, d, a]]
      });
    }
  }
  return {type: 'GeometryCollection', geometries: geometries};
};

internal.getHexGridCoordinates = function(params) {
  var xInterval = params.interval;
  var yInterval = Math.sqrt(3) * xInterval / 2;
  var xOddRowShift = xInterval / 2;
  var xmax = params.width + xInterval * 2; // width of hexagon is 2 * xInterval
  var ymax = params.height + yInterval * 2; // height of hexagon is 2 * yInterval
  var y = -yInterval;
  var rows = [];
  var x, row;
  while (y < ymax) {
    x = rows.length % 2 === 0 ? 0 : -xOddRowShift;
    row = [];
    rows.push(row);
    while (x < xmax) {
      row.push([x, y]);
      x += xInterval;
    }
    y += yInterval;
  }
  return rows;
};

internal.getSquareGridCoordinates = function(params) {
  var y = 0, rows = [],
      interval = params.interval,
      xmax = params.width + interval,
      ymax = params.height + interval,
      x, row;
  while (y < ymax) {
    x = 0;
    row = [];
    rows.push(row);
    while (x < xmax) {
      row.push([x, y]);
      x += interval;
    }
    y += interval;
  }
  return rows;
};

internal.alignGridToBounds = function(geojson, bbox) {
  var geojsonBbox = internal.findPolygonGridBounds(geojson);
  var dx = (bbox[2] + bbox[0]) / 2 - (geojsonBbox[2] + geojsonBbox[0]) / 2;
  var dy = (bbox[3] + bbox[1]) / 2 - (geojsonBbox[3] + geojsonBbox[1]) / 2;
  internal.shiftPolygonGrid(geojson, dx, dy);
};

internal.shiftPolygonGrid = function(geojson, dx, dy) {
  geojson.geometries.forEach(function(geom) {
    if (geom.type == 'Point') {
      geom.coordinates = [geom.coordinates[0] + dx, geom.coordinates[1] + dy];
    }
    if (geom.type == 'Polygon') {
      geom.coordinates[0] = geom.coordinates[0].map(function(xy) {
        return [xy[0] + dx, xy[1] + dy];
      });
    }
  });
};

internal.findPolygonGridBounds = function(geojson) {
  var boundsFunctions = {
    Point: pointBounds,
    Polygon: polygonBounds
  };
  return geojson.geometries.reduce(function(memo, geom) {
    var getBounds = boundsFunctions[geom.type];
    var bbox = getBounds(geom);
    if (!memo) return bbox;
    updateBounds(memo, bbox[0], bbox[1]);
    updateBounds(memo, bbox[2], bbox[3]);
    return memo;
  }, null);

  function polygonBounds(geom) {
    return geom.coordinates[0].reduce(function(bbox, p) {
      if (!bbox) return [p[0], p[1], p[0], p[1]];
      updateBounds(bbox, p[0], p[1]);
      return bbox;
    }, null);
  }

  function pointBounds(geom) {
    var p = geom.coordinates;
    return [p[0], p[1], p[0], p[1]];
  }

  function updateBounds(bbox, x, y) {
    if (x < bbox[0]) bbox[0] = x;
    if (y < bbox[1]) bbox[1] = y;
    if (x > bbox[2]) bbox[2] = x;
    if (y > bbox[3]) bbox[3] = y;
  }
};
