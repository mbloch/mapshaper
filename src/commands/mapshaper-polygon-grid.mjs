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
  } else if (params.type == 'hex') {
    geojson = getHexGridGeoJSON(getHexGridCoordinates(params));
  } else if (params.type == 'hex2') {
    // use rotated grid
    geojson = getHexGridGeoJSON(getHexGridCoordinates(swapGridParams(params)));
    swapPolygonCoords(geojson);
  } else {
    stop('Unsupported grid type');
  }
  alignGridToBounds(geojson, params.bbox);
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
  if (opts.interval) {
    params.interval = convertIntervalParam(opts.interval, crs);
  } else {
    stop('Missing required interval option');
  }
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
  return params;
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
