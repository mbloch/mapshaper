/* @requires mapshaper-dataset-utils */

api.pointGrid = function(dataset, opts) {
  var bbox, gridLyr;
  if (opts.bbox) {
    bbox = opts.bbox;
  } else if (dataset) {
    bbox = MapShaper.getDatasetBounds(dataset).toArray();
  } else {
    bbox = [-180, -90, 180, 90];
  }
  gridLyr = MapShaper.createPointGrid(bbox, opts);
  return gridLyr;
};

MapShaper.createPointGrid = function(bbox, opts) {
  var w = bbox[2] - bbox[0],
      h = bbox[3] - bbox[1],
      points = [],
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
    stop('[point-grid] Invalid grid parameters');
  }

  y = y0;
  while (y <= bbox[3]) {
    x = x0;
    while (x <= bbox[2]) {
      points.push([[x, y]]);
      x += dx;
    }
    y += dy;
  }
  return {
    geometry_type: 'point',
    shapes: points
  };
};
