import { IdTestIndex } from '../indexing/mapshaper-id-test-index';



// Returns a function that receives a cell index and returns indices of points
//   within a given distance of the cell.
export function getGridToPointIndex(points, grid, radius) {
  var Flatbush = require('flatbush');
  var gridIndex = new IdTestIndex(grid.cells());
  var bboxIndex = new Flatbush(points.length);
  var empty = [];
  points.forEach(function(p) {
    var bbox = getPointBounds(p, radius);
    var addNeighbors = true; // TODO: only if radius is > 0?
    addPointToGridIndex(p, gridIndex, grid, addNeighbors);
    bboxIndex.add.apply(bboxIndex, bbox);
  });
  bboxIndex.finish();

  return function(i) {
    if (!gridIndex.hasId(i)) {
      return empty;
    }
    var bbox = grid.idxToBBox(i);
    var indices = bboxIndex.search.apply(bboxIndex, bbox);
    return indices;
  };
}

// TODO: support spherical coords
function getPointBounds(p, radius) {
  return [p[0] - radius, p[1] - radius, p[0] + radius, p[1] + radius];
}

function addPointToGridIndex(p, index, grid, addNeighbors) {
  var i = grid.pointToIdx(p);
  var [c, r] = grid.idxToColRow(i);
  addCellToGridIndex(c, r, grid, index);
  if (addNeighbors) {
    grid.forEachNeighbor(c, r, function(c, r) {
      addCellToGridIndex(c, r, grid, index);
    });
  }
}

function addCellToGridIndex(c, r, grid, index) {
  var i = grid.colRowToIdx(c, r);
  if (i > -1) index.setId(i);
}

