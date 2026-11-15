// Splitting a grid into overlapping tiles that can be processed separately
// (e.g. in workers), with the same result as processing the whole grid. A
// tile's core, columns x0 to x1 and rows y0 to y1 (exclusive), is the part of
// the grid it is responsible for. Its full extent, xa to xb and ya to yb, adds
// a margin of the processing's reach on each side where the grid continues.

// Returns the tiles of the layout of up to @maxTiles tiles whose largest tile,
// margins included, is smallest; the slowest tile sets the running time. Of
// layouts with equal largest tiles, the one with fewer tiles wins.
// @reach width of the margins, in pixels; Infinity gives a single tile
// @align if true, tiles start on even rows and columns, for processing that
//   works on 2x2 blocks
export function getTileLayout(width, height, maxTiles, reach, align) {
  var best = null, bestArea = Infinity;
  var nx, ny, tiles, area;
  if (!(reach < Infinity) || !(maxTiles > 1)) {
    return getGridTiles(width, height, 1, 1, 0, align);
  }
  for (nx = 1; nx <= Math.min(maxTiles, width); nx++) {
    for (ny = 1; nx * ny <= maxTiles && ny <= height; ny++) {
      tiles = getGridTiles(width, height, nx, ny, reach, align);
      area = getLargestTileArea(tiles);
      if (area < bestArea || area == bestArea && tiles.length < best.length) {
        best = tiles;
        bestArea = area;
      }
    }
  }
  return best;
}

export function getGridTiles(width, height, nx, ny, reach, align) {
  var cols = splitRange(width, nx, align);
  var rows = splitRange(height, ny, align);
  var tiles = [];
  rows.forEach(function(r) {
    cols.forEach(function(c) {
      tiles.push({
        x0: c[0], x1: c[1], y0: r[0], y1: r[1],
        xa: getMarginStart(c[0], reach, align), xb: Math.min(width, c[1] + reach),
        ya: getMarginStart(r[0], reach, align), yb: Math.min(height, r[1] + reach)
      });
    });
  });
  return tiles;
}

function getMarginStart(start, reach, align) {
  var a = Math.max(0, start - reach);
  return align ? a - a % 2 : a;
}

// Splits 0 to @len into up to @n ranges of equal size (except the last)
function splitRange(len, n, align) {
  var size = Math.ceil(len / n);
  var ranges = [];
  if (align) size += size % 2;
  for (var a = 0; a < len; a += size) {
    ranges.push([a, Math.min(len, a + size)]);
  }
  return ranges;
}

function getLargestTileArea(tiles) {
  return tiles.reduce(function(memo, t) {
    return Math.max(memo, (t.xb - t.xa) * (t.yb - t.ya));
  }, 0);
}

// Copies the full extent of @tile from @src, a grid of @width columns
// (any typed array, one value per pixel)
export function copyTile(src, width, tile) {
  var w = tile.xb - tile.xa;
  var h = tile.yb - tile.ya;
  var out = new src.constructor(w * h);
  var y, i;
  for (y = 0; y < h; y++) {
    i = (tile.ya + y) * width + tile.xa;
    out.set(src.subarray(i, i + w), y * w);
  }
  return out;
}

// Copies the core of @src, the result of processing @tile, into @dest, a grid
// of @width columns
export function pasteTileCore(dest, width, tile, src) {
  var w = tile.xb - tile.xa;
  var coreWidth = tile.x1 - tile.x0;
  var y, i;
  for (y = tile.y0; y < tile.y1; y++) {
    i = (y - tile.ya) * w + tile.x0 - tile.xa;
    dest.set(src.subarray(i, i + coreWidth), y * width + tile.x0);
  }
}
