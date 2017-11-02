/* @requires mapshaper-common */


// Returns a grid of [x,y] points so that point(c,r) == arr[r][c]
// @f  Function for creating a [x,y] point at a given (col, row) position
//
internal.generateGrid = function(cols, rows, f) {
  var grid = [], gridRow, r, c;
  for (r=0; r<rows; r++) {
    grid.push(gridRow = []);
    for (c=0; c<cols; c++) {
      gridRow.push(f(c, r));
    }
  }
  return grid;
};

internal.getSimpleGridFunction = function(w, h, x0, y0) {
  return function(c, r) {
    return [x0 + c * w, y0 + r * h];
  };
};

// Rows with odd ids are shifted right by half of the cell width
internal.getOffsetGridFunction = function(w, h, x0, y0) {
  return function(c, r) {
    var dx = r % 2 == 1 ? w / 2 : 0;
    return [x0 + c * w + dx, y0 + r * h];
  };
};
