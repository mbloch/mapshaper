import { parseColor } from '../color/color-utils';
import { getPairInterpolator } from '../classification/mapshaper-interpolation';
import { getVibranceChroma } from '../color/oklab';
import { getClassId } from '../classification/mapshaper-class-stats';
import { stop } from '../utils/mapshaper-logging';

// Colors a band of a raster's values for display, as set by -classify on a
// raster (see docs/development/raster-palette-design.md):
//
// raster.view.recipe.palette = {
//   band,           // band number in the source file (1-based)
//   type,           // 'sequential' | 'diverging' | 'categorical'
//   continuous,     // interpolate between colors, which are at the breaks
//   breaks,         // ascending; classes have one fewer break than colors
//   colors,         // CSS colors
//   categories,     // categorical: the value of each color
//   otherColor,     // categorical: the color of other values (default nullColor)
//   nullColor,      // the color of nodata pixels; null is transparent
//   interpolation,  // continuous: 'oklch' (default) or 'rgb'
//   vibrance,       // continuous: 0-1, as -classify vibrance=
//   sea,            // pixels at or below 0 that reach the grid's edge or its pixels
//                   // without values (see mapshaper-raster-sea-mask.mjs):
//                   // 'transparent' leaves them out; the name of a
//                   // bathymetric preset colors them by seaRamp
//   seaRamp,        // {breaks, colors, classed}: colors at depths, in the
//                   // band's units, continuous unless classed (see
//                   // setRasterPaletteSea())
//   seaSeeds,       // [[x, y, level], ...]: points in the inland seas, in the
//                   // raster's coordinates, or null if its CRS is unknown
//                   // (see mapshaper-inland-seas.mjs)
//   land,           // 'transparent': only the sea is drawn (hypsometric=none)
//   hypsometric,    // the preset of -classify hypsometric=, or 'blended'
//   blend           // hypsometric=blended: the presets' ramps and weights
//                   // (see mapshaper-raster-hypsometric.mjs)
// }

var RAMP_SEGMENT_SIZE = 256; // table entries between two continuous breaks
var MAX_LOOKUP_RANGE = 65536; // largest span of integer categories given an array lookup
var MAX_CACHED_TABLES = 8;
var tableCache = [];

export function getRasterPalette(recipe) {
  return recipe && recipe.palette || null;
}

// A string that changes whenever the palette's colors would
export function getRasterPaletteKey(palette) {
  if (!palette) return '';
  return JSON.stringify([palette.band, palette.type, !!palette.continuous, palette.breaks || null,
    palette.colors || null, palette.categories || null, palette.nullColor || null,
    palette.otherColor || null,
    palette.interpolation || null, palette.vibrance === undefined ? null : palette.vibrance,
    palette.blend ? [palette.blend.ramps, palette.blend.field && palette.blend.field.key] : null,
    palette.sea || null, palette.seaRamp || null, palette.land || null, palette.seaSeeds || null]);
}

export function rasterPaletteIsCategorical(palette) {
  return !!palette && palette.type == 'categorical';
}

// Returns {rgba, getIndex, nullIndex, otherIndex}
//   rgba: Uint8Array of colors, 4 bytes each
//   getIndex(val): the color of a (valid) value, as an index into rgba, or -1
//     if it has none (a category that isn't in the palette)
//   nullIndex: the index of the null color, or -1 if nodata is transparent
//   otherIndex: the index of the color of values without one, or -1
// Tables are cached by getRasterPaletteKey(), so redrawing a raster while
// panning and zooming doesn't rebuild them.
export function getRasterPaletteTable(palette) {
  return getCachedTable(getRasterPaletteKey(palette), function() {
    return buildRasterPaletteTable(palette);
  });
}

function getCachedTable(key, build) {
  var entry = tableCache.find(function(o) { return o.key == key; });
  if (!entry) {
    entry = {key: key, table: build()};
    tableCache.unshift(entry);
    if (tableCache.length > MAX_CACHED_TABLES) tableCache.pop();
  }
  return entry.table;
}

// The table for the sea of a palette with a bathymetric ramp, or null
export function getRasterSeaTable(palette) {
  var ramp = palette.seaRamp;
  if (!ramp) return null;
  // a solid sea (one color) is one class
  if (!ramp.classed && ramp.colors.length > 1) {
    return getRasterPaletteTable({type: 'sequential', continuous: true, interpolation: 'oklch',
      breaks: ramp.breaks, colors: ramp.colors});
  }
  return getCachedTable(JSON.stringify(['sea classes', ramp.breaks, ramp.colors]), function() {
    return getSeaClassTable(ramp.colors, ramp.breaks);
  });
}

// The sea's classes mirror the land's: each color runs from its depth down to
// the next stop's, which it leaves out, so a value equal to a stop takes the
// stop's color. The shallowest color also takes the values above its stop,
// and the deepest those below its stop.
// @stops: ascending, a color at each
function getSeaClassTable(colors, stops) {
  var table = getColorList(colors);
  var n = colors.length;
  if (stops.length != n) {
    stop('A classed sea needs a color at each depth');
  }
  table.getIndex = function(val) {
    var i = 0;
    while (i < n - 1 && val > stops[i]) i++;
    return i;
  };
  return table;
}

function buildRasterPaletteTable(palette) {
  var colors = palette.colors || [];
  var table;
  if (palette.type == 'categorical') {
    table = getCategoryTable(palette.categories || [], colors);
  } else if (palette.continuous) {
    table = getRampTable(colors, palette.breaks || [], palette);
  } else {
    table = getClassTable(colors, palette.breaks || []);
  }
  table.nullIndex = palette.nullColor ? addColor(table, palette.nullColor) : -1;
  table.otherIndex = palette.otherColor ? addColor(table, palette.otherColor) : table.nullIndex;
  return table;
}

// Colors between each pair of breaks are interpolated as -classify continuous
// interpolates them, so that a raster and a vector layer classified the same
// way get the same colors. Values outside the breaks take the end colors.
function getRampTable(colors, breaks, palette) {
  var n = RAMP_SEGMENT_SIZE;
  var segments = breaks.length - 1;
  var opts = {interpolation: palette.interpolation || 'oklch'};
  var rgba, interpolate, seg, i;
  if (colors.length != breaks.length || segments < 1) {
    stop('A continuous raster palette needs a color for each break');
  }
  if (palette.vibrance > 0) opts.vibrance = getVibranceChroma(palette.vibrance);
  rgba = new Uint8Array(segments * n * 4 + 8);
  for (seg = 0; seg < segments; seg++) {
    interpolate = getPairInterpolator(colors[seg], colors[seg + 1], opts);
    for (i = 0; i < n; i++) {
      setColor(rgba, seg * n + i, interpolate(i / (n - 1)));
    }
  }
  return {
    rgba: rgba,
    count: segments * n,
    getIndex: function(val) {
      var last = segments;
      var s = 0;
      if (!(val > breaks[0])) return 0;
      if (val >= breaks[last]) return last * n - 1;
      while (val >= breaks[s + 1]) s++;
      return s * n + Math.round((val - breaks[s]) / (breaks[s + 1] - breaks[s]) * (n - 1));
    }
  };
}

// A value equal to a break is in the class above it, as with -classify
function getClassTable(colors, breaks) {
  var table = getColorList(colors);
  if (colors.length != breaks.length + 1) {
    stop('A classed raster palette needs one more color than breaks');
  }
  table.getIndex = function(val) {
    return getClassId(val, breaks);
  };
  return table;
}

function getCategoryTable(categories, colors) {
  var table = getColorList(colors);
  var ints = categories.length > 0 && categories.every(function(val) {
    return val === Math.floor(val);
  });
  var min = ints ? Math.min.apply(null, categories) : 0;
  var max = ints ? Math.max.apply(null, categories) : 0;
  var lookup, map;
  if (categories.length != colors.length) {
    stop('A categorical raster palette needs a color for each category');
  }
  if (ints && max - min < MAX_LOOKUP_RANGE) {
    lookup = new Int32Array(max - min + 1).fill(-1);
    categories.forEach(function(val, i) { lookup[val - min] = i; });
    table.getIndex = function(val) {
      return val >= min && val <= max && val === Math.floor(val) ? lookup[val - min] : -1;
    };
  } else {
    map = new Map();
    categories.forEach(function(val, i) { map.set(val, i); });
    table.getIndex = function(val) {
      var i = map.get(val);
      return i === undefined ? -1 : i;
    };
  }
  return table;
}

function getColorList(colors) {
  var rgba = new Uint8Array(colors.length * 4 + 8);
  colors.forEach(function(color, i) { setColor(rgba, i, color); });
  return {rgba: rgba, count: colors.length};
}

// Adds a color in one of the two spare slots at the end of the table; returns
// its index
function addColor(table, color) {
  setColor(table.rgba, table.count, color);
  return table.count++;
}

function setColor(rgba, i, color) {
  var o = parseColor(color);
  if (!o) stop('Unsupported color in raster palette:', color);
  rgba[i * 4] = Math.round(o.r);
  rgba[i * 4 + 1] = Math.round(o.g);
  rgba[i * 4 + 2] = Math.round(o.b);
  rgba[i * 4 + 3] = Math.round(o.a * 255);
}
