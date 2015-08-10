/* @requires mapshaper-gui-lib */

gui.addTableShapes = function(lyr, dataset) {
  var n = lyr.data.size(),
      cellWidth = 12,
      cellHeight = 5,
      gutter = 6,
      arcs = [],
      shapes = [],
      aspectRatio = 1.1,
      usePoints = false,
      x, y, col, row, blockSize;
  if (dataset.arcs) {
    error("Unable to visualize data table.");
  }
  if (n > 10000) {
    usePoints = true;
    gutter = 0;
    cellWidth = 4;
    cellHeight = 4;
    aspectRatio = 1.45;
  } else if (n > 5000) {
    cellWidth = 5;
    gutter = 3;
    aspectRatio = 1.45;
  } else if (n > 1000) {
    gutter = 3;
    cellWidth = 8;
    aspectRatio = 1.3;
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
    y = cellHeight * (blockSize - row);
    if (usePoints) {
      shapes.push([[x, y]]);
    } else {
      arcs.push(getArc(x, y, cellWidth, cellHeight));
      shapes.push([[i]]);
    }
  }

  if (usePoints) {
    lyr.geometry_type = 'point';
  } else {
    dataset.arcs = new ArcCollection(arcs);
    lyr.geometry_type = 'polygon';
  }
  lyr.shapes = shapes;
  lyr.data_type = 'table';

  function getArc(x, y, w, h) {
    return [[x, y], [x + w, y], [x + w, y - h], [x, y - h], [x, y]];
  }
};
