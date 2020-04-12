import { internal } from './gui-core';

export function getDisplayLayerForTable(table) {
  var n = table.size(),
      cellWidth = 12,
      cellHeight = 5,
      gutter = 6,
      arcs = [],
      shapes = [],
      aspectRatio = 1.1,
      x, y, col, row, blockSize;

  if (n > 10000) {
    arcs = null;
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
    if (arcs) {
      arcs.push(getArc(x, y, cellWidth, cellHeight));
      shapes.push([[i]]);
    } else {
      shapes.push([[x, y]]);
    }
  }

  function getArc(x, y, w, h) {
    return [[x, y], [x + w, y], [x + w, y - h], [x, y - h], [x, y]];
  }

  return {
    layer: {
      geometry_type: arcs ? 'polygon' : 'point',
      shapes: shapes,
      data: table
    },
    arcs: arcs ? new internal.ArcCollection(arcs) : null
  };
}
