/* @requires mapshaper-dataset-utils, geojson-import */

api.pointGrid = function(dataset, opts) {
  var bbox, gridLyr;
  if (opts.bbox) {
    bbox = opts.bbox;
  } else if (dataset) {
    bbox = internal.getDatasetBounds(dataset).toArray();
  } else {
    bbox = [-180, -90, 180, 90];
  }
  return internal.createPointGridLayer(internal.createPointGrid(bbox, opts), opts);
};

api.polygonGrid = function(dataset, opts) {
  var bbox, gridLyr;
  if (opts.bbox) {
    bbox = opts.bbox;
  } else if (dataset) {
    bbox = internal.getDatasetBounds(dataset).toArray();
  } else {
    bbox = [-180, -90, 180, 90];
  }
  return internal.createPolygonGridDataset(internal.createPointGrid(bbox, opts), opts);
};

internal.createPointGridLayer = function(rows, opts) {
  var points = [], lyr;
  rows.forEach(function(row, rowId) {
    for (var i=0; i<row.length; i++) {
      points.push([row[i]]);
    }
  });
  lyr = {
    geometry_type: 'point',
    shapes: points
  };
  if (opts.name) lyr.name = opts.name;
  return lyr;
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

// Returns a grid of [x,y] points so that point(c,r) == arr[r][c]
internal.createPointGrid = function(bbox, opts) {
  var w = bbox[2] - bbox[0],
      h = bbox[3] - bbox[1],
      rowsArr = [], rowArr,
      cols, rows, dx, dy, x0, y0, x, y;

  if (opts.interval > 0) {
    dx = opts.interval;
    dy = opts.interval;
    cols = Math.round(w / dx) - 1;
    rows = Math.round(h / dy) - 1;
    x0 = bbox[0] + (w - cols * dx) / 2;
    y0 = bbox[1] + (h - rows * dy) / 2;
  } else if (opts.rows > 0 && opts.cols > 0) {
    cols = opts.cols;
    rows = opts.rows;
    dx = (w / cols);
    dy = (h / rows);
    x0 = bbox[0] + dx / 2;
    y0 = bbox[1] + dy / 2;
  }

  if (dx > 0 === false || dy > 0 === false) {
    stop('Invalid grid parameters');
  }

  y = y0;
  while (y <= bbox[3]) {
    x = x0;
    rowsArr.push(rowArr = []);
    while (x <= bbox[2]) {
      rowArr.push([x, y]);
      x += dx;
    }
    y += dy;
  }
  return rowsArr;
};
