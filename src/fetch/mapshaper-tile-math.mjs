// Web Mercator tile arithmetic for -fetch (XYZ scheme: y counts down from the
// north edge). Pure functions, so they can be tested directly.

export var WEB_MERCATOR_RADIUS = 6378137;
export var WEB_MERCATOR_MAX_LAT = 85.0511287798066;
var WORLD_SIZE = 2 * Math.PI * WEB_MERCATOR_RADIUS;
var MIN_LON_GAP = 60;

export function lonToTileX(lon, z) {
  return (lon + 180) / 360 * Math.pow(2, z);
}

export function latToTileY(lat, z) {
  var phi = clampLat(lat) * Math.PI / 180;
  return (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * Math.pow(2, z);
}

// Ground size of a tile pixel, in meters, at a latitude
export function getTileGroundResolution(lat, z, tileSize) {
  return WORLD_SIZE * Math.cos(clampLat(lat) * Math.PI / 180) / (tileSize * Math.pow(2, z));
}

// The lowest zoom whose pixels are at least as fine as @metersPerPixel, so the
// source has 1-2 pixels for each output pixel.
export function chooseTileZoom(metersPerPixel, lat, tileSize, minZoom, maxZoom) {
  var z = minZoom || 0;
  var max = maxZoom >= 0 ? maxZoom : 22;
  while (z < max && getTileGroundResolution(lat, z, tileSize) > metersPerPixel) {
    z++;
  }
  return z;
}

// The smallest longitude interval containing all of @lons, treating longitude
// as circular. Returns [west, east], where east may exceed 180 if the interval
// crosses the antimeridian.
export function getCircularLonRange(lons) {
  var sorted = lons.map(normalizeLon).sort(function(a, b) { return a - b; });
  var n = sorted.length;
  var maxGap = -1, gapEnd = 0, gap, i;
  if (n === 0) return null;
  for (i = 0; i < n; i++) {
    gap = i < n - 1 ? sorted[i + 1] - sorted[i] : sorted[0] + 360 - sorted[n - 1];
    if (gap > maxGap) {
      maxGap = gap;
      gapEnd = (i + 1) % n;
    }
  }
  // samples from a world-scale map leave only small gaps between them
  if (maxGap < MIN_LON_GAP) return [-180, 180];
  // the interval starts after the largest gap
  var west = sorted[gapEnd];
  var east = sorted[(gapEnd + n - 1) % n];
  if (east < west) east += 360;
  return [west, east];
}

// Tile index range covering a lon-lat box. x1 may be >= 2^z when the box
// crosses the antimeridian; use wrapTileX() to get a fetchable index.
export function getTileRange(bbox, z) {
  var n = Math.pow(2, z);
  var x0 = Math.floor(lonToTileX(bbox[0], z));
  var x1 = Math.floor(lonToTileX(bbox[2], z) - 1e-9);
  var y0 = Math.floor(latToTileY(bbox[3], z));
  var y1 = Math.floor(latToTileY(bbox[1], z) - 1e-9);
  x0 = Math.max(0, x0);
  x1 = Math.max(x0, Math.min(x1, x0 + n - 1));
  y0 = Math.max(0, Math.min(n - 1, y0));
  y1 = Math.max(y0, Math.min(n - 1, y1));
  return {z: z, x0: x0, x1: x1, y0: y0, y1: y1};
}

export function countTiles(range) {
  return (range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1);
}

export function wrapTileX(x, z) {
  var n = Math.pow(2, z);
  return ((x % n) + n) % n;
}

// Web Mercator bbox (meters) of a tile range. Ranges that cross the
// antimeridian extend past the east edge of the world.
export function getTileRangeMercatorBBox(range) {
  var n = Math.pow(2, range.z);
  var tileSize = WORLD_SIZE / n;
  var half = WORLD_SIZE / 2;
  return [
    range.x0 * tileSize - half,
    half - (range.y1 + 1) * tileSize,
    (range.x1 + 1) * tileSize - half,
    half - range.y0 * tileSize
  ];
}

function clampLat(lat) {
  return Math.max(-WEB_MERCATOR_MAX_LAT, Math.min(WEB_MERCATOR_MAX_LAT, lat));
}

function normalizeLon(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}
