import { error } from '../utils/mapshaper-logging';
import { orient2D } from '../geom/mapshaper-segment-geom';

// Columns are vertical and rows are horizontal in the "flat-top" orientation;
//   columns are horizontal in the "pointy-top" orientation
// Array indexes are column-first in both orientations
// The 0,0 cell is in the bottom left corner
// Currently the origin cell is always an "outie" (protruding); in the future
//   "innie" origin cells may be supported

export function getHexGridParams(bbox, interval, opts) {
  var params = {};
  params.flatTop = opts.type != 'hex2'; // hex2 is "pointy-top" orientation
  // origin cell (bottom left) may be "outie" or "innie" ... could be settable
  params.outieOrigin = true;

  // get origin and counts for centered grid
  // params.u0 = _getUOrigin();
  // params.v0 = _getVOrigin();
  // params.colCounts = _getColCounts(bbox, interval);
  // params.rowCounts = _getRowCounts(bbox, interval);

  if (opts.aligned) {

  }
}


// interval: side length in projected coordinates
// bbox: bounding box of area to be enclosed by grid
//
export function getHexGridMaker(bbox, interval, opts) {
  var flatTop = opts.type != 'hex2'; // hex2 is "pointy-top" orientation
  // origin cell (bottom left) may be "outie" or "innie" ... could be settable
  var outieOrigin = true;
  var centered = true; // TODO: implement aligned
  var minorInterval = interval * Math.sqrt(3) / 2;
  var _colCounts = _getColCounts(bbox, interval);
  var _rowCounts = _getRowCounts(bbox, interval);
  // coordinates of the center of the bottom left cell
  var _uOrigin = _getUOrigin();
  var _vOrigin = _getVOrigin();

  var params = getHexGridParams(bbox, interval, opts);

  function cells() {
    return _rowCounts[0] * _colCounts[0] + _rowCounts[1] * _colCounts[1];
  }

  // a is col in flatTop orientation
  function colRowToIdx(col, row) {
    // fatCol: a pair of adjacent (offset) columns
    var fatColSize = _rowCounts[0] + _rowCounts[1];
    var fatColId = Math.floor(col / 2);
    var idx = fatColId * fatColSize;
    // oddCol: cell is in an odd-numbered column (or row)
    var oddCols = col % 2 == 1;
    if (oddCols) {
      idx += _rowCounts[1];
    }
    idx += row;

    // check index bounds
    if (col < 0 || row < 0) error('negative grid index');
    if (oddCols && row >= _rowCounts[1] || !oddCols && row >= _rowCounts[0]) {
      error('out-of-bounds minor axis index');
    }
    if (oddCols && col >= _colCounts[1] || !oddCols && col >= _colCounts[0]) {
      error('out-of-bounds major axis index');
    }
    return idx;
  }

  function pointToIdx(xy) {
    return flatTop ?
      _uvToIdx(xy[0], xy[1]) :
      _uvToIdx(xy[1], xy[0]);
  }

  // Col,row numbering and array indexing are aligned (same for both flat-top and pointed-top orientations)
  function idxToColRow(id) {
    var fatColSize = _rowCounts[0] + _rowCounts[1];
    var fatColId = Math.floor(id / fatColSize);
    var col = fatColId * 2;
    var extra = id - fatColId * fatColSize;
    if (extra >= _rowCounts[0]) {
      col++;
      extra -= _rowCounts[0];
    }
    return [col, extra];
  }

  function idxToBBox(id) {
    var bbox = _idxToBBox(id);
    return flatTop ? bbox: [bbox[1], bbox[0], bbox[3], bbox[2]];
  }

  function makeCellPolygon(idx, opts) {
    var geom = {
      type: 'Polygon',
      coordinates: [_makeCellCoords(idx)]
    };
    if (!flatTop) {
      flipPolygonCoords(geom);
    }
    return geom;
  }

  function forEachNeighbor(c, r, cb) {
    var rowShift;
    if (outieOrigin) {
      rowShift = isOdd(c) ? 0 : -1;
    } else {
      rowShift = isOdd(c) ? -1 : 0;
    }
    cb(c, r+1);
    cb(c+1, r + rowShift + 1);
    cb(c+1, r + rowShift);
    cb(c, r-1);
    cb(c-1, r + rowShift + 1);
  }

  // horizontal origin (x coord) in flat-top orientation
  function _getUOrigin() {
    var range = _getUAxisRange(bbox);
    var extent = range[1] - range[0];
    var cols = _colCounts[0] + _colCounts[1];
    var outerExtent = 1.5 * cols * interval + 0.5 * interval;
    var margin = (outerExtent - extent) / 2; // center data bbox within grid
    // origin is one side length to the right of the left boundary
    var origin = range[0] - margin + interval;
    return origin;
  }

  // vertical origin (y coord) in flat-top orientation
  function _getVOrigin() {
    var range = _getVAxisRange(bbox);
    var extent = range[1] - range[0];
    var rows = _rowCounts[0] + _rowCounts[1];
    var outerExtent = (rows + 1) * minorInterval;
    var margin = (outerExtent - extent) / 2;
    var origin = range[0] - margin + minorInterval;
    if (!outieOrigin) {
      origin += minorInterval;
    }
    return origin;
  }

  function _getUAxisRange(bbox) {
    return flatTop ? [bbox[0], bbox[2]] : [bbox[1], bbox[3]];
  }

  function _getVAxisRange(bbox) {
    return flatTop ? [bbox[1], bbox[3]] : [bbox[0], bbox[2]];
  }

  function _uvToIdx(u, v) {
    var [c, r] = _uvToColRow(u, v);
    return colRowToIdx(c, r);
  }

  // x, y are reversed in pointy-top orientation
  function _uvToColRow(u, v) {
    var left = _uOrigin - 1.5 * interval;
    var vOffs = outieOrigin ? 0 : -minorInterval;
    var bottom = _vOrigin - minorInterval + vOffs;
    var ui = Math.floor((u - left) / (1.5 * interval));
    var vi = Math.floor((v - bottom) / minorInterval);
    var cwBar = isOdd(ui) != isOdd(vi);
    if (!outieOrigin) {
      cwBar = !cwBar;
    }
    var u1 = left + ui * 1.5 * interval + interval * 0.5;
    var u2 = u1 + interval * 0.5;
    var v1 = bottom + vi * minorInterval;
    var v2 = v1 + minorInterval;
    var orientation = cwBar ?
      orient2D(u1, v1, u2, v2, u, v) :
      orient2D(u2, v1, u1, v2, u, v);
    var colId = orientation > 0 ? ui - 1 : ui;
    var rowId = Math.floor(vi / 2);
    return [colId, rowId];
  }

  function _idxToBBox(id) {
    var uv = _idxToPoint(id);
    return [
      uv[0] - interval,
      uv[1] - minorInterval,
      uv[0] + interval,
      uv[1] + minorInterval
    ];
  }

  // center point of cell
  function idxToPoint(id) {
    var p = _idxToPoint(id);
    return flatTop ? p : flipPoint(p);
  }

  function _isUpperCell(col) {
    return outieOrigin && isOdd(col) || !outieOrigin && !isOdd(col);
  }

  function _idxToPoint(id) {
    var [c, r] = idxToColRow(id);
    return _colRowToPoint(c, r);
  }

  function _colRowToPoint(c, r) {
    var vShift = isOdd(c) ? (outieOrigin ? minorInterval : -minorInterval) : 0;
    var u = _uOrigin + c * 1.5 * interval;
    var v = _vOrigin + vShift + r * minorInterval * 2;
    return [u, v];
  }

  function _colRowToVertex(c, r, half) {
    var [u, v] = _colRowToPoint(c, r);
    return [u - (half ? interval : interval / 2), v - (half ? 0 : minorInterval)];
  }

  function _makeCellCoords(idx) {
    var [c, r] = idxToColRow(idx);
    var rowOffs = _isUpperCell(c) ? 0 : -1;
    var v0 = _colRowToVertex(c, r, false);
    return [
      v0,
      _colRowToVertex(c, r, false),
      _colRowToVertex(c, r, true),
      _colRowToVertex(c, r + 1, false),
      _colRowToVertex(c + 1, r + 1 + rowOffs, true),
      _colRowToVertex(c + 1, r + 1 + rowOffs, false),
      _colRowToVertex(c + 1, r + rowOffs, true),
      v0
    ];
  }

  function _getColCounts(bbox, interval) {
    var extent = flatTop ? bbox[2] - bbox[0] : bbox[3] - bbox[1];
    var n = Math.ceil((2 * extent + interval) / (3 * interval));
    var a = Math.ceil(n / 2);
    var b = Math.floor(n / 2);
    return outieOrigin ? [a, b] : [b, a];
  }

  function _getRowCounts(bbox, interval) {
    var extent = flatTop ? bbox[3] - bbox[1] : bbox[2] - bbox[0];
    var n = Math.ceil(1 + 2 * extent / (interval * Math.sqrt(3)));
    var a = Math.ceil(n / 2);
    var b = Math.floor(n / 2);
    return outieOrigin ? [a, b] : [b, a];
  }

  return {
    cells,
    colRowToIdx,
    idxToColRow,
    pointToIdx,
    idxToPoint,
    idxToBBox,
    makeCellPolygon,
    forEachNeighbor
  };
}

function isOdd(int) {
  return int % 2 !== 0;
}

function flipPolygonCoords(geom) {
  for (var i=0, n=geom ? geom.coordinates.length : 0; i<n; i++) {
    geom.coordinates[i].forEach(flipPoint);
  }
}

function flipPoint(p) {
  var tmp = p[1];
  p[1] = p[0];
  p[0] = p[1];
  return p;
}
