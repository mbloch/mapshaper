/* @requires mapshaper-gui-lib */

gui.addTableShapes = function(lyr, dataset) {
  var n = lyr.data.size(),
      cellWidth = 12,
      cellHeight = 5,
      gutter = 6,
      arcs = [],
      shapes = [],
      aspectRatio = 1.3,
      x, y, col, row, blockSize;
  if (dataset.arcs) {
    error("Unable to visualize data table.");
  }
  if (n > 20000) {
    cellWidth = 5;
    gutter = 3;
    aspectRatio = 1.45;
  } else if (n > 5000) {
    cellWidth = 8;
    gutter = 4;
  } else if (n > 2000) {
    gutter = 5;
    cellWidth = 10;
  }

  if (n < 25) {
    blockSize = n;
  } else {
    blockSize = Math.sqrt(n * (cellWidth + gutter) / cellHeight / aspectRatio) | 0;
  }

  for (var i=0; i<n; i++) {
    row = i % blockSize;
    col = Math.floor(i / blockSize);
    x = col * (cellWidth + gutter);
    y = -row * cellHeight - 1e6; // out of range of geographic layers
    arcs.push(getArc(x, y, cellWidth, cellHeight));
    shapes.push([[i]]);
  }

  dataset.arcs = new ArcCollection(arcs);
  lyr.shapes = shapes;
  lyr.geometry_type = 'polygon';
  lyr.menu_type = 'data record';

  function getArc(x, y, w, h) {
    return [[x, y], [x + w, y], [x + w, y - h], [x, y - h], [x, y]];
  }
};
