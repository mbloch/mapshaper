import { getDatasetBounds, copyDatasetInfo } from '../dataset/mapshaper-dataset-utils';
import { setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { convertIntervalParam } from '../geom/mapshaper-units';
import { getDatasetCRS, requireProjectedDataset } from '../crs/mapshaper-projections';
import { importGeoJSON } from '../geojson/geojson-import';
import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';
import { buildTopology } from '../topology/mapshaper-topology';
import { getHexGridMaker } from '../grids/mapshaper-hex-grid';
import { getSquareGridMaker } from '../grids/mapshaper-square-grid';

cmd.polygonGrid = function(targetLayers, targetDataset, opts) {
  requireProjectedDataset(targetDataset);
  var params = getGridParams(targetLayers, targetDataset, opts);
  var gridDataset = makeGridDataset(params, opts); // grid is a new dataset
  gridDataset.info = copyDatasetInfo(targetDataset.info);
  setOutputLayerName(gridDataset.layers[0], null, 'grid', opts);
  if (opts.debug) gridDataset.layers.push(cmd.pointGrid2(targetLayers, targetDataset, opts));
  return gridDataset;
};


// TODO: Update -point-grid command to use this function
cmd.polygonGrid2 = function(targetLayers, targetDataset, opts) {
  requireProjectedDataset(targetDataset);
  var params = getGridParams(targetLayers, targetDataset, opts);
  // alignGridToBounds(geojson, params.bbox);
  var gridDataset = makeGridDataset2(params, opts);
  gridDataset.info = copyDatasetInfo(targetDataset.info);
  setOutputLayerName(gridDataset.layers[0], null, 'grid', opts);
  return gridDataset;
};

function makeGridDataset2(params, opts) {
  var geojson, dataset, grid;
  if (params.type == 'square') {
    grid = getSquareGridMaker(params.bbox, params.interval, opts);
  } else if (params.type == 'hex') {
    grid = getHexGridMaker(params.bbox, params.interval, opts);
  } else {
    stop('Unsupported grid type');
  }
  var features = [];
  for (var i=0, n=grid.cells(); i<n; i++) {
    features.push({
      type: 'Feature',
      properties: null,
      geometry: grid.makeCellPolygon(i, opts)
    });
  }
  geojson = {
    type: 'FeatureCollection',
    features: features
  };
  dataset = importGeoJSON(geojson, {});
  buildTopology(dataset);
  return dataset;
}

// TODO: Update -point-grid command to use this function
cmd.pointGrid2 = function(targetLayers, targetDataset, opts) {
  var params = getGridParams(targetLayers, targetDataset, opts);
  var geojson;
  if (params.type == 'square') {
    geojson = getPointGridGeoJSON(getSquareGridCoordinates(params));
  } else if (params.type == 'hex') {
    geojson = getPointGridGeoJSON(getHexGridCoordinates(params));
  } else {
    stop('Unsupported grid type');
  }
  alignGridToBounds(geojson, params.bbox);
  var gridDataset = importGeoJSON(geojson, {});
  if (opts.name) gridDataset.layers[0].name = opts.name;
  return gridDataset.layers[0];
};

function makeGridDataset(params, opts) {
  var geojson, dataset;
  if (params.type == 'square') {
    geojson = getSquareGridGeoJSON(getSquareGridCoordinates(params));
  } else if (params.type == 'square2') {
    geojson = getRotatedSquareGridGeoJSON(params);
  } else if (params.type == 'hex') {
    geojson = getHexGridGeoJSON(getHexGridCoordinates(params));
  } else if (params.type == 'hex2') {
    // use rotated grid
    geojson = getHexGridGeoJSON(getHexGridCoordinates(swapGridParams(params)));
    swapPolygonCoords(geojson);
  } else if (params.type == 'rhombus') {
    geojson = getRhombusGridGeoJSON(params, false);
  } else if (params.type == 'rhombus2') {
    geojson = getRhombusGridGeoJSON(params, true);
  } else if (params.type == 'triangle') {
    geojson = getTriangleGridGeoJSON(params, false);
  } else if (params.type == 'triangle2') {
    geojson = getTriangleGridGeoJSON(params, true);
  } else {
    stop('Unsupported grid type');
  }
  scaleGridCells(geojson, params.cellScale);
  alignGridToBounds(geojson, params.bbox);
  cullGridCells(geojson, params.bbox);
  dataset = importGeoJSON(geojson, {});
  buildTopology(dataset);
  return dataset;
}

function swapGridParams(params) {
  var bbox = params.bbox;
  return utils.defaults({
    width: params.height,
    height: params.width,
    bbox: [bbox[1], bbox[0], bbox[3], bbox[2]]
  }, params);
}

function swapPolygonCoords(json) {
  json.geometries.forEach(function(geom) {
    geom.coordinates[0] = geom.coordinates[0].map(function(p) {
      return [p[1], p[0]];
    });
  });
}

function getGridParams(layers, dataset, opts) {
  var params = {};
  var crs = dataset ? getDatasetCRS(dataset) : null;
  if (opts.bbox) {
    params.bbox = opts.bbox;
  } else if (dataset) {
    dataset = utils.defaults({layers: layers}, dataset);
    params.bbox = getDatasetBounds(dataset).toArray();
  } else {
    stop('Missing grid bbox');
  }
  params.width = params.bbox[2] - params.bbox[0];
  params.height = params.bbox[3] - params.bbox[1];
  params.type = opts.type || 'square';
  params.interval = getGridInterval(params, opts, crs);
  params.cellScale = getCellScale(opts);
  return params;
}

function getCellScale(opts) {
  var scale = opts.cell_scale == null ? 1 : opts.cell_scale;
  if (scale > 0 && scale < 2) return scale;
  stop('cell-scale= option should be greater than 0 and less than 2');
}

function getGridInterval(params, opts, crs) {
  var interval = opts.interval ? convertIntervalParam(opts.interval, crs) : 0;
  var hasSizeOpt = opts.cols != null || opts.rows != null || opts.cells != null;
  var sizeOpts = 0;
  if (opts.cols > 0) sizeOpts++;
  if (opts.rows > 0) sizeOpts++;
  if (opts.cells > 0) sizeOpts++;
  if (interval && hasSizeOpt) {
    stop('Use interval= or cols=/rows=/cells=, not both');
  }
  if (interval) return interval;
  validateGridSizeOpt('cols', opts.cols);
  validateGridSizeOpt('rows', opts.rows);
  validateGridSizeOpt('cells', opts.cells);
  if (sizeOpts === 0) {
    stop('Missing required interval, cols, rows or cells option');
  }
  return getIntervalFromGridSize(params, opts);
}

function validateGridSizeOpt(name, value) {
  if (value > 0 || value == null) return;
  stop(name + '= option should be a positive integer');
}

function getIntervalFromGridSize(params, opts) {
  var factor = getCellAreaFactor(params.type);
  var intervals = [];
  if (opts.cols > 0) intervals.push(params.width / opts.cols / Math.sqrt(factor));
  if (opts.rows > 0) intervals.push(params.height / opts.rows / Math.sqrt(factor));
  if (opts.cells > 0) intervals.push(Math.sqrt(params.width * params.height / opts.cells / factor));
  return Math.min.apply(null, intervals);
}

function getCellAreaFactor(type) {
  if (type == 'square' || type == 'square2') return 1;
  if (type == 'hex' || type == 'hex2') return 3 * Math.sqrt(3) / 2;
  if (type == 'rhombus' || type == 'rhombus2') return Math.sqrt(3) / 2;
  if (type == 'triangle' || type == 'triangle2') return Math.sqrt(3) / 4;
  stop('Unsupported grid type');
}

function scaleGridCells(geojson, scale) {
  if (scale == 1) return;
  geojson.geometries.forEach(function(geom) {
    if (geom.type == 'Polygon') {
      geom.coordinates[0] = scalePolygonRing(geom.coordinates[0], scale);
    }
  });
}

function scalePolygonRing(coords, scale) {
  var center = getPolygonRingCenter(coords);
  return coords.map(function(p) {
    return [
      center[0] + (p[0] - center[0]) * scale,
      center[1] + (p[1] - center[1]) * scale
    ];
  });
}

function cullGridCells(geojson, bbox) {
  geojson.geometries = geojson.geometries.filter(function(geom) {
    return geom.type != 'Polygon' || polygonIntersectsBBox(geom.coordinates[0], bbox);
  });
}

function polygonIntersectsBBox(coords, bbox) {
  var rect = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]];
  var i, j;
  for (i=0; i<coords.length - 1; i++) {
    if (pointInBBox(coords[i], bbox)) return true;
  }
  for (i=0; i<rect.length; i++) {
    if (pointInPolygon(rect[i], coords)) return true;
  }
  for (i=0; i<coords.length - 1; i++) {
    for (j=0; j<rect.length; j++) {
      if (segmentsIntersect(coords[i], coords[i + 1], rect[j], rect[(j + 1) % rect.length])) {
        return true;
      }
    }
  }
  return false;
}

function pointInBBox(p, bbox) {
  return p[0] >= bbox[0] && p[0] <= bbox[2] && p[1] >= bbox[1] && p[1] <= bbox[3];
}

function pointInPolygon(p, coords) {
  var isInside = false;
  var a, b;
  for (var i=0, n=coords.length - 1, j=n - 1; i<n; j=i++) {
    a = coords[i];
    b = coords[j];
    if (orient2D(a, b, p) === 0 && pointOnSegment(p, a, b)) return true;
    if (a[1] > p[1] != b[1] > p[1] &&
        p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) {
      isInside = !isInside;
    }
  }
  return isInside;
}

function segmentsIntersect(a, b, c, d) {
  var ab_c = orient2D(a, b, c);
  var ab_d = orient2D(a, b, d);
  var cd_a = orient2D(c, d, a);
  var cd_b = orient2D(c, d, b);
  if (ab_c === 0 && pointOnSegment(c, a, b)) return true;
  if (ab_d === 0 && pointOnSegment(d, a, b)) return true;
  if (cd_a === 0 && pointOnSegment(a, c, d)) return true;
  if (cd_b === 0 && pointOnSegment(b, c, d)) return true;
  return ab_c > 0 != ab_d > 0 && cd_a > 0 != cd_b > 0;
}

function orient2D(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(p, a, b) {
  return p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) &&
      p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
}

function getPointGridGeoJSON(arr) {
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
}

function getHexGridGeoJSON(arr) {
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
}

function getRhombusGridGeoJSON(params, rotated) {
  var geojson;
  if (rotated) {
    geojson = getHexGridGeoJSON(getHexGridCoordinates(swapGridParams(params)));
    swapPolygonCoords(geojson);
  } else {
    geojson = getHexGridGeoJSON(getHexGridCoordinates(params));
  }
  geojson.geometries = geojson.geometries.reduce(function(memo, geom) {
    return memo.concat(subdivideHexagon(geom.coordinates[0]));
  }, []);
  return geojson;
}

function getTriangleGridGeoJSON(params, rotated) {
  var geojson;
  if (rotated) {
    geojson = getHexGridGeoJSON(getHexGridCoordinates(swapGridParams(params)));
    swapPolygonCoords(geojson);
  } else {
    geojson = getHexGridGeoJSON(getHexGridCoordinates(params));
  }
  geojson.geometries = geojson.geometries.reduce(function(memo, geom) {
    return memo.concat(triangulateHexagon(geom.coordinates[0]));
  }, []);
  return geojson;
}

function subdivideHexagon(coords) {
  var center = getPolygonRingCenter(coords);
  return [
    getRhombusCell(coords, center, 0),
    getRhombusCell(coords, center, 2),
    getRhombusCell(coords, center, 4)
  ];
}

function getRhombusCell(coords, center, i) {
  return {
    type: 'Polygon',
    coordinates: [[center, coords[i], coords[i + 1], coords[(i + 2) % 6], center]]
  };
}

function triangulateHexagon(coords) {
  var triangles = [];
  var center = getPolygonRingCenter(coords);
  for (var i=0; i<6; i++) {
    triangles.push({
      type: 'Polygon',
      coordinates: [[center, coords[i], coords[(i + 1) % 6], center]]
    });
  }
  return triangles;
}

function getPolygonRingCenter(coords) {
  var x = 0, y = 0;
  var n = coords.length - 1; // ignore closing point
  for (var i=0; i<n; i++) {
    x += coords[i][0];
    y += coords[i][1];
  }
  return [x / n, y / n];
}

function getSquareGridGeoJSON(arr) {
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
}

function getRotatedSquareGridGeoJSON(params) {
  var interval = params.interval;
  var radius = interval * Math.SQRT1_2;
  var geometries = [];
  var row = 0;
  var x, y, x0;
  for (y = -radius; y <= params.height + radius; y += radius) {
    x0 = -2 * radius + (row % 2 ? radius : 0);
    for (x = x0; x <= params.width + 2 * radius; x += 2 * radius) {
      geometries.push(getRotatedSquareCell(x, y, radius));
    }
    row++;
  }
  return {type: 'GeometryCollection', geometries: geometries};
}

function getRotatedSquareCell(x, y, radius) {
  return {
    type: 'Polygon',
    coordinates: [[
      [x, y - radius],
      [x + radius, y],
      [x, y + radius],
      [x - radius, y],
      [x, y - radius]
    ]]
  };
}

function getHexGridCoordinates(params) {
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
}

function getSquareGridCoordinates(params) {
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
}

function alignGridToBounds(geojson, bbox) {
  var geojsonBbox = findPolygonGridBounds(geojson);
  var dx = (bbox[2] + bbox[0]) / 2 - (geojsonBbox[2] + geojsonBbox[0]) / 2;
  var dy = (bbox[3] + bbox[1]) / 2 - (geojsonBbox[3] + geojsonBbox[1]) / 2;
  shiftPolygonGrid(geojson, dx, dy);
}

function shiftPolygonGrid(geojson, dx, dy) {
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
}

function findPolygonGridBounds(geojson) {
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
}
