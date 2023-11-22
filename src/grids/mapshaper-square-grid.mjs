import { getPlanarSegmentEndpoint } from '../geom/mapshaper-geodesic';
import { getPointBufferCoordinates } from '../buffer/mapshaper-point-buffer';

export function getAlignedGridBounds(bbox, interval) {
  var xx = getAlignedRange(bbox[0], bbox[2], interval);
  var yy = getAlignedRange(bbox[1], bbox[3], interval);
  return [xx[0], yy[0], xx[1], yy[1]];
}

export function getCenteredGridBounds(bbox, interval) {
  var xx = getCenteredRange(bbox[0], bbox[2], interval);
  var yy = getCenteredRange(bbox[1], bbox[3], interval);
  return [xx[0], yy[0], xx[1], yy[1]];
}

// grid boundaries includes the origin
// (this way, grids calculated from different sets of points will all align)
function getAlignedRange(minCoord, maxCoord, interval) {
  var idx = Math.floor(minCoord / interval) - 1;
  var idx2 = Math.ceil(maxCoord / interval) + 1;
  return [idx * interval, idx2 * interval];
}

function getCenteredRange(minCoord, maxCoord, interval) {
  var w = maxCoord - minCoord;
  var w2 = Math.ceil(w / interval) * interval;
  var pad = (w2 - w) / 2 + interval;
  return [minCoord - pad, maxCoord + pad];
}

// TODO: Use this function for other grid-based commands
export function getSquareGridMaker(bbox, interval, opts) {
  var extent = opts && opts.aligned ?
    getAlignedGridBounds(bbox, interval) :
    getCenteredGridBounds(bbox, interval);
  var xmin = extent[0];
  var ymin = extent[1];
  var w = extent[2] - xmin;
  var h = extent[3] - ymin;
  var cols = Math.round(w / interval);
  var rows = Math.round(h / interval);
  // var xmin = bbox[0] - interval;
  // var ymin = bbox[1] - interval;
  // var xmax = bbox[2] + interval;
  // var ymax = bbox[3] + interval;
  // var w = xmax - xmin;
  // var h = ymax - ymin;
  // var cols = Math.ceil(w / interval);
  // var rows = Math.ceil(h / interval);

  // function size() {
  //   return [cols, rows];
  // }

  function cells() {
    return cols * rows;
  }

  function pointToCol(xy) {
    var dx = xy[0] - xmin;
    return Math.floor(dx / w * cols);
  }

  function pointToRow(xy) {
    var dy = xy[1] - ymin;
    return Math.floor(dy / h * rows);
  }

  function colRowToIdx(c, r) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    return r * cols + c;
  }

  function pointToIdx(xy) {
    var c = pointToCol(xy);
    var r = pointToRow(xy);
    return colRowToIdx(c, r);
  }

  function idxToColRow(i) {
    return [i % cols, Math.floor(i / cols)];
  }

  function idxToPoint(idx) {
    var [c, r] = idxToColRow(idx);
    var x = xmin + (c + 0.5) * interval;
    var y = ymin + (r + 0.5) * interval;
    return [x, y];
  }

  function idxToBBox(idx) {
    var cr = idxToColRow(idx);
    return [
      xmin + cr[0] * interval, ymin + cr[1] * interval,
      xmin + (cr[0] + 1) * interval, ymin + (cr[1] + 1) * interval
    ];
  }

  function makeCellPolygon(idx, opts) {
    var coords = opts.circles ?
      makeCircleCoords(idx, opts) :
      makeCellCoords(idx, opts);
    return {
      type: 'Polygon',
      coordinates: [coords]
    };
  }

  function makeCellCoords(idx, opts) {
    var bbox = idxToBBox(idx);
    var margin = opts.interval * (opts.cell_margin || 0);
    var a = bbox[0] + margin,
        b = bbox[1] + margin,
        c = bbox[2] - margin,
        d = bbox[3] - margin;
    return [[a, b],[a, d],[c, d],[c, b],[a, b]];
  }

  function makeCircleCoords(idx, opts) {
    var center = idxToPoint(idx);
    var margin = opts.cell_margin > 0 ? opts.cell_margin : 1e-6;
    var radius = opts.interval / 2 * (1 - margin);
    var vertices = opts.vertices || 20;
    return getPointBufferCoordinates(center, radius, vertices, getPlanarSegmentEndpoint);
  }

  function forEachNeighbor(c, r, cb) {
    cb(c+1, r+1);
    cb(c+1, r);
    cb(c+1, r-1);
    cb(c, r+1);
    cb(c, r-1);
    cb(c-1, r+1);
    cb(c-1, r);
    cb(c-1, r-1);
  }

  return {
    // size,
    // pointToCol,
    // pointToRow,
    // makeCellCoords,
    // makeCircleCoords,
    cells,
    colRowToIdx,
    pointToIdx,
    idxToColRow,
    // idxToRow,
    idxToBBox,
    idxToPoint,
    makeCellPolygon,
    forEachNeighbor
  };
}