
api.polygonGrid = function(targetLayers, dataset, opts) {
  var gridOpts = internal.getGridParams(dataset, opts);
  // return internal.createPolygonGridDataset(internal.createPointGrid(gridOpts), opts);
};

// key parameters:
internal.getGridParams = function(dataset, opts) {
  var params = {};
  var crs = dataset ? internal.getDatasetCRS(dataset) : null;
  if (opts.interval) {
    params.interval = internal.convertIntervalParam(opts.interval, crs);
  } else if (opts.rows > 0 && opts.cols > 0) {
    params.rows = opts.rows;
    params.cols = opts.cols;
  } else {
    // error, handled later
  }
  if (opts.bbox) {
    params.bbox = opts.bbox;
  } else if (dataset) {
    params.bbox = internal.getDatasetBounds(dataset).toArray();
  } else {
    params.bbox = [-180, -90, 180, 90];
  }
  return params;
};

internal.createRegularGridGeoJSON = function(params) {
  var geometries;




};

internal.getHexGridGeoJSON = function(arr) {
  var geometries = [], a, b, c, d, e, f, even;
  var row, col, colOffset;
  for (row = 0, rows = arr.length - 1; row < rows; row++) {
    even = row % 2 === 0;
    for (col = 1, cols = arr[i].length - 2; col < cols; col += 3) {
      colOffset = even ? 0 : 1;
      a = arr[row][col + colOffset];
      b = arr[row + 1][col];
      c = arr[row + 2][col + 1 + colOffset];
      d = arr[row + 2][col + 1 + colOffset];
      e = arr[row + 1][col + 2];
      f = arr[row][col + 1 + colOffset];
      geometries.push({
        type: 'Polygon',
        coordinates: [[a, b, c, d, e, f, a]]
      });
    }
  }
  return geometries;
};

internal.getSquareGridGeoJSON = function(arr) {
  var geometries = [], a, b, c, d;
  for (var row = 0, rows = arr.length - 2; row < rows; row++) {
    for (var col = 0, cols = arr[i].length - 1; col < cols; col++) {
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
  return geometries;
};

internal.getHexGridCoordinates = function(interval, w, h) {
  var xoff = interval / 2;
  var yoff = Math.sqrt(3) * interval;
  var y = -yoff;
  var xmax = w + interval;
  var ymax = h + interval;
  var rows = [];
  var x, cols;
  while (y < ymax) {
    x = rows % 2 === 0 ? 0 : -xoff;
    cols = [];
    rows.push(cols);
    while (x < xmax) {
      cols.push([x, y]);
      x += interval;
    }
    y += yoff;
  }
  return rows;
};

internal.getSquareGridCoordinates = function(interval, w, h) {
  var y = 0, rows = [],
      xmax = w + interval,
      ymax = h + interval,
      x, cols;
  while (y < ymax) {
    x = 0;
    cols = [];
    rows.push(cols);
    while (x < xmax) {
      cols.push([x, y]);
      x += interval;
    }
    y += interval;
  }
  return rows;
};

internal.createPolygonGridDataset = function(rows, opts) {
  var rings = [], rowArr;
  var col, row, tl, br, ring;
  for (row = 0; row < rows.length - 1; row++) {
    rowArr = rows[row];
    for (col = 0; col < rowArr.length - 1; col++) {
      bl = rows[row][col];
      tr = rows[row + 1][col + 1];
      ring = [[bl[0], bl[1]], [bl[0], tr[1]], [tr[0], tr[1]], [tr[0], bl[1]], [bl[0], bl[1]]];
      rings.push(ring);
    }
  }
  var geojson = {
    type: "GeometryCollection",
    geometries: rings.map(function(ring){
      return {
        type: 'Polygon',
        coordinates: [ring]
      };
    })
  };
  var dataset = internal.importGeoJSON(geojson, {});
  if (opts.name) dataset.layers[0].name = opts.name;
  return dataset;
};
