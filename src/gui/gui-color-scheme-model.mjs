import { internal } from './gui-core';
import { quoteCommandValue } from './gui-command-utils';
import {
  getRasterBandFields, getRasterBandValues, getRasterBandCounts, getRasterCategoryFields,
  getRasterBandCategories, rasterHasContinuousValues, getRasterLayerPaletteKey,
  rasterBandCouldBeElevation, rasterBandIsElevation, getRasterUnitMeters, getRasterCategoricalPalette,
  getRasterCategoryName
} from './gui-raster-band-values';

// The state behind the color scheme panel, as plain objects and functions
// that return new ones. See docs/development/color-scheme-panel-design.md
//
// A sequential scheme is either a preset (a named d3 ramp, possibly reversed)
// or a custom ramp defined by pins ([{t, color}], see src/color/color-ramps.mjs).
// Editing a tile of a preset turns it into a custom ramp, pinned at the
// preset's two ends and at the edited tile.
//
// A categorical scheme is a palette of swatches, either a d3 categorical
// scheme (in its own order, or rearranged) or a custom list, of which the
// first n are used. Its 'categorical' method gives each unique value of the
// field a swatch, taking them in turn (so there are never more swatches in
// use than values); 'non-adjacent' has no field, and colors neighboring
// polygons differently. Editing a swatch of a preset turns it into a custom
// list.
//
// A diverging scheme is a ramp of 2K+1 tiles: K tiles on either side of a
// center color, where K is the number of classes on the longer side of the
// pivot. The shorter side uses the tiles nearest the center, and the center
// tile colors the pivot class (if there is one). How many classes each side
// has depends on the data, so the scheme keeps the layout that -classify
// will find (see updateDivergingLayout()). A custom diverging ramp is pinned
// at its ends and its center.
//
// On a raster layer, the fields are bands (see gui-raster-band-values.mjs),
// and -classify sets the raster's palette instead of writing fills. A raster's
// schemes have raster: true; their no-data color is null (transparent) unless
// one is set, and there is no non-adjacent method.
//
// A sequential scheme on a raster that could hold elevations can have fixed
// elevations (method 'elevation'): continuous colors at the elevations of a
// hypsometric preset (see hypsometric-schemes.mjs), in the band's units,
// whatever the data's range, or for one preset (not a blend), classes from
// each stop up to the next (continuous: false). Its tiles are the preset's stops, which can be
// recolored and moved (in the class breaks dialog), but not added to or taken
// away. Choosing a preset gives its own colors and elevations. Another method
// keeps the colors as a custom ramp.
//
// A continuous sequential or diverging scheme gives unclassed colors: its
// tiles are color stops, at the data's min, the class breaks and its max,
// with colors interpolated between them. Each side of a diverging scheme is
// a ramp of its own, a tile longer than its classes (so K is the longer
// side's classes + 1); the center tile is used only by a pivot class, which
// is a flat band of the center color.
//
// scheme: {
//   type: 'sequential', 'diverging' or 'categorical',
//   field, method, n,                         (n: the number of colors, or for
//                                             diverging schemes, of classes:
//                                             the total, or per side)
//   preset: name or null, reversed: boolean,  (presets)
//   range: {start, end, base} or null         (presets: the part of the ramp
//                                             the tiles are taken from, 0-1
//                                             in the preset's own direction;
//                                             see getSchemeRange())
//   pins: [{t, color}] or null,               (custom sequential ramps)
//   vibrance, longHue                         (custom sequential ramps, see
//                                             getOklchInterpolator())
//   order: [...] or null                      (categorical presets: indexes
//                                             of the preset's colors, as
//                                             rearranged)
//   swatches: [...] or null                   (custom categorical lists)
//   elevationPreset: name,                    (fixed elevations: the
//   stopColors: [...] or null                 hypsometric preset, and its
//   stops: [...] or null                      colors and elevations (in the
//                                             band's units), once edited;
//                                             preset is null when the
//                                             colors are)
//   blended: boolean                          (fixed elevations: blended by
//                                             climate, with preset 'Blended',
//                                             or null once recolored; the
//                                             presets share the stops)
//   blendColors: {name: [...]} or null        (blended: the colors of the
//                                             presets that were recolored,
//                                             see getBlendRampColors())
//   seaScheme: {elevationPreset, preset,      (fixed elevations: the colors
//     stopColors, stops, n} or null           of pixels at or below 0 that are
//                                             open to the sea, at fixed
//                                             depths, like the land's; null
//                                             leaves the sea out. See
//                                             getSeaScheme(), -classify sea=)
//   landTransparent: boolean                  (fixed elevations: only the sea
//                                             is colored)
//   continuous: boolean                       (sequential and diverging)
//   pivot: 'auto', 'median', 'mean' or a number,
//   neutral, continuousNeutral: boolean       (a pivot class, for classed
//                                             and continuous schemes; see
//                                             getSchemeNeutral())
//   split: 'size' or 'count'                  (diverging: n is the total
//                                             number of classes, split so
//                                             they're the same size on both
//                                             sides, or the number per side)
//   layout: {pivot, neutral, below, above, breaks} or null
//                                             (diverging: the classes the
//                                             data gives, see
//                                             getDivergingLayout())
//   nullColor       the color of features with no data (both types; not
//                   used by non-adjacent schemes)
//   raster          the scheme is for a raster layer
//   paletteKey      raster schemes: the palette they gave the layer
//   colors: [...]   the colors that were applied, for checking a layer later
//   fillHash        continuous schemes: a fingerprint of the fills they gave
//                   the layer (interpolated fills aren't the scheme's colors)
// }

// The panel's tabs. Elevation schemes are sequential schemes with fixed
// elevations (see getSchemeTab()).
export var schemeTypes = [
  {name: 'sequential', label: 'Sequential'},
  {name: 'diverging', label: 'Diverging'},
  {name: 'elevation', label: 'Elevation'},
  {name: 'categorical', label: 'Categorical'}
];

// For the Sea menu: the bathymetric presets
export function getBathymetricPresetNames() {
  return internal.getBathymetricSchemeNames();
}

export var classifyMethods = [
  {name: 'quantile', label: 'Quantile'},
  {name: 'equal-interval', label: 'Equal interval'},
  {name: 'hybrid', label: 'Hybrid'},
  {name: 'nice', label: 'Nice breaks'}
];

export var pivotOptions = [
  {name: 'auto', label: 'Auto (0 or median)'},
  {name: 'median', label: 'Median'},
  {name: 'mean', label: 'Mean'},
  {name: 'value', label: 'Value'}
];

export var divergingSplits = [
  {name: 'size', label: 'Same class size'},
  {name: 'count', label: 'Same number of classes'}
];

export var categoricalMethods = [
  {name: 'categorical', label: 'Categories'},
  {name: 'non-adjacent', label: 'Non-adjacent'}
];

// -classify's default null value for colors, as hex
export var defaultNullColor = '#eeeeee';

export var minSchemeColors = 2;
export var maxSchemeColors = 12;
export var maxCategoricalColors = 20;
// a palette that gives each category its own color (a raster's file palette,
// see getRasterPaletteScheme(), or an imported one) can have more than that
export var maxFilePaletteColors = 40;
var defaultCategoricalPreset = 'batlowS';
var defaultNonAdjacentColors = 5;
var defaultDivergingPreset = 'RdBu';
var blendedPresetName = 'Blended';
var defaultDivergingClasses = 7;
var defaultDivergingSideClasses = 3;
var maxDivergingSideClasses = 6;
// colors for growing a custom categorical list past the palette it came from
var extraSwatchSource = 'Tableau20';
// vibrance is OKLCH chroma added to the colors of each interpolated segment
// (-classify's vibrance= is the same, scaled to 0-1)
export var defaultVibrance = 0;
export var maxVibrance = internal.MAX_VIBRANCE_CHROMA;
// the default sequential ramp: cream to blue, through green and teal
var defaultEnds = ['#fff8da', '#2d4d8e'];
// Cyclic ramps start and end on the same hue, which reads as a category
// rather than an order.
var excludedPresets = ['Rainbow', 'Sinebow'];

// Layers keep the scheme that colored them, so that the panel can reopen it
// and the style panel can show it. Undo and redo of a scheme edit put back
// the scheme that went with the colors (see the panel's command session).
var layerSchemes = new WeakMap();

export function getSequentialPresetNames() {
  return flattenGroups(getPresetGroups('sequential'));
}

export function getDivergingPresetNames() {
  return flattenGroups(getPresetGroups('diverging'));
}

export function getCategoricalPresetNames() {
  return flattenGroups(getPresetGroups('categorical'));
}

// The presets of a scheme type, by source, for the palette menu:
// [{source, names}]. Sequential presets include -classify's multi-hue
// ('rainbow') schemes.
// opts.nyt  include the NYT presets, which come first (see nyt-schemes.mjs)
export function getPresetGroups(type, opts) {
  var types = type == 'sequential' ? ['sequential', 'rainbow'] : [type];
  var nyt = !!(opts && opts.nyt);
  return internal.getColorSchemeGroups(types).filter(function(group) {
    return nyt || group.source != 'NYT';
  }).map(function(group) {
    return {source: group.source, names: group.names.filter(function(name) {
      return !excludedPresets.includes(name);
    })};
  }).filter(function(group) {
    return group.names.length > 0;
  });
}

function flattenGroups(groups) {
  return groups.reduce(function(memo, group) { return memo.concat(group.names); }, []);
}

// The scheme a panel tab starts with on a layer. A raster of continuous values
// starts with continuous colors: classes of elevation look like contour
// bands, which is a choice rather than a default.
// points: [lon, lat] points across the layer, for the elevation tab, which
//   starts with the presets blended by climate where it can (they are one
//   preset across a small area)
export function getDefaultSchemeOfType(type, lyr, points) {
  var scheme;
  if (type == 'elevation') {
    scheme = getDefaultSchemeOfType('sequential', lyr);
    scheme = setSchemeMethod(setSchemeField(scheme, getElevationFields(lyr)[0] || scheme.field), 'elevation', null, -1, points);
    return points && internal.getClimatePreset(points) ? chooseBlendedElevations(scheme, points) : scheme;
  }
  scheme = type == 'categorical' ? getDefaultCategoricalScheme(lyr) :
    type == 'diverging' ? getDefaultDivergingScheme(lyr) :
    getDefaultScheme(getNumericFields(lyr)[0]);
  if (!isRasterLayer(lyr)) return scheme;
  scheme = setSchemeLayerType(scheme, lyr);
  if (type != 'categorical' && rasterHasContinuousValues(lyr)) {
    scheme = updateDivergingLayout(setSchemeContinuous(scheme, true), lyr);
  }
  return scheme;
}

function isRasterLayer(lyr) {
  return !!(lyr && internal.layerHasRaster(lyr));
}

// Marks a scheme (e.g. an imported one) as being for a raster layer, or not
export function setSchemeLayerType(scheme, lyr) {
  var raster = isRasterLayer(lyr);
  if (!!scheme.raster == raster) return scheme;
  return Object.assign({}, scheme, {raster: raster});
}

// A number of the values that the scheme classifies, e.g. '3 features'. A
// raster's are pixels of a sample, counted as a share of the sample: '12% of
// pixels', or with short, '12%'.
export function formatSchemeCount(scheme, lyr, n, short) {
  if (!isRasterLayer(lyr)) return short ? String(n) : n + (n == 1 ? ' feature' : ' features');
  return formatShare(n, getSchemeValueCounts(scheme, lyr).values) + (short ? '' : ' of pixels');
}

// The number of features with no data, or the share of a raster's pixels
// that are nodata
export function formatNoDataCount(scheme, lyr, n) {
  if (!isRasterLayer(lyr)) return formatSchemeCount(scheme, lyr, n);
  return formatShare(n, getSchemeValueCounts(scheme, lyr).total) + ' of pixels';
}

function formatShare(n, total) {
  var pct = total > 0 ? n / total * 100 : 0;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  if (pct < 100 && pct > 99.9) return '>99.9%';
  return (pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct)) + '%';
}

// The number of values that the scheme's counts are out of, and for a
// raster, the number of pixels (including nodata) and valid pixels:
// {values, total, valid}
export function getSchemeValueCounts(scheme, lyr) {
  var counts = isRasterLayer(lyr) ? getRasterBandCounts(lyr, scheme.field) : null;
  if (counts) return {values: counts.sampled, total: counts.total, valid: counts.count};
  return {values: getAscendingValues(lyr, scheme.field).length, total: null, valid: null};
}

export function getDefaultDivergingScheme(lyr) {
  return updateDivergingLayout({
    type: 'diverging',
    field: getNumericFields(lyr)[0] || null,
    method: 'quantile',
    n: defaultDivergingClasses,
    split: 'size',
    pivot: 'auto',
    neutral: true,
    preset: defaultDivergingPreset,
    reversed: false,
    pins: null,
    vibrance: defaultVibrance
  }, lyr);
}

// The layout of a diverging scheme's classes on the layer's data, as
// -classify finds it; null if there are no data to classify. Done after
// every change that can move the classes (the field, method, pivot, pivot
// class, number of classes), and when the panel opens, since the data may
// have changed.
export function updateDivergingLayout(scheme, lyr) {
  if (scheme.type != 'diverging') return scheme;
  return Object.assign({}, scheme, {layout: getDivergingLayout(scheme, lyr)});
}

function getDivergingLayout(scheme, lyr) {
  var values = getAscendingValues(lyr, scheme.field);
  if (values.length === 0) return null;
  var neutral = getSchemeNeutral(scheme);
  var custom = scheme.method == 'breaks';
  try {
    return internal.getDivergingLayout(values, scheme.method, {
      pivot: custom ? scheme.breakPivot : scheme.pivot,
      breaks: custom ? scheme.breaks : undefined,
      continuous: !!scheme.continuous,
      pivot_class: neutral,
      no_pivot_class: !neutral,
      classes: getDivergingClassesOption(scheme)
    });
  } catch(e) {
    return null;
  }
}

// Whether a diverging scheme has a pivot class. Classed and continuous
// schemes each keep their own setting, so that switching between them keeps
// both: on by default for classes, off for continuous colors.
export function getSchemeNeutral(scheme) {
  return scheme.continuous ? !!scheme.continuousNeutral : scheme.neutral !== false;
}

export function isContinuousScheme(scheme) {
  return scheme.type != 'categorical' && !!scheme.continuous;
}

// A sequential ramp starts with at least this many stops, since -classify
// interpolates straight between them, so vibrance and the long hue path
// show only at the stops.
var minContinuousStartColors = 5;

export function setSchemeContinuous(scheme, continuous) {
  var next;
  if (isElevationScheme(scheme)) {
    return canClassifyElevations(scheme) ? Object.assign({}, scheme, {continuous: !!continuous}) : scheme;
  }
  next = Object.assign({}, !!continuous == !!scheme.continuous ? scheme : resetSchemeBreaks(scheme), {continuous: !!continuous});
  if (continuous && next.type == 'sequential' && next.n < minContinuousStartColors) {
    next.n = minContinuousStartColors;
  }
  return next;
}

function getAscendingValues(lyr, field) {
  if (isRasterLayer(lyr)) return getRasterBandValues(lyr, field);
  if (!lyr || !lyr.data || !field || !lyr.data.fieldExists(field)) return [];
  return lyr.data.getRecords().map(function(rec) {
    return rec ? rec[field] : undefined;
  }).filter(isFiniteNumber).sort(function(a, b) { return a - b; });
}

// -classify's classes= for a diverging scheme
function getDivergingClassesOption(scheme) {
  return scheme.split == 'count' ? [scheme.n, scheme.n] : scheme.n;
}

// The number of tiles of a ramp: for a diverging scheme, the center tile and
// enough on each side for the longer side's classes (or a continuous
// side's stops)
function getRampSize(scheme) {
  var layout = scheme.layout;
  var k;
  if (scheme.type != 'diverging') return scheme.n;
  k = layout ? Math.max(layout.below, layout.above) :
    scheme.split == 'count' ? scheme.n : Math.floor(scheme.n / 2);
  k = scheme.continuous ? k + 1 : Math.max(k, 1);
  return k * 2 + 1;
}

// The numbers of tiles that each side of a diverging scheme uses
function getSideTiles(scheme) {
  var layout = scheme.layout;
  if (!scheme.continuous) return [layout.below, layout.above];
  return [internal.getContinuousSideStops(layout.below), internal.getContinuousSideStops(layout.above)];
}

// One boolean per tile of a diverging scheme: whether a class (or a color
// stop) uses it
export function getDivergingTileUse(scheme) {
  var size = getRampSize(scheme);
  var k = (size - 1) / 2;
  var layout = scheme.layout;
  var sides = layout ? getSideTiles(scheme) : [0, 0];
  var use = [];
  for (var i=0; i<size; i++) {
    use.push(!!layout && (i < k ? i >= k - sides[0] : i > k ? i <= k + sides[1] : !!layout.neutral));
  }
  return use;
}

// The data value at each tile of a continuous scheme: {value, min, max}
// (min and max: the value is the data's min or max), or for a diverging
// scheme's center tile, the pivot class's range: {range}. Tiles that no stop
// uses are null. Returns null if there are no data.
export function getContinuousTileStops(scheme, lyr) {
  var values, breaks, layout, stops, k, tiles;
  if (isElevationScheme(scheme)) {
    return getElevationSchemeStops(scheme, lyr).map(function(val) {
      return {value: val, min: false, max: false};
    });
  }
  if (scheme.type == 'sequential') {
    values = getAscendingValues(lyr, scheme.field);
    if (values.length === 0) return null;
    try {
      breaks = getSequentialSchemeBreaks(scheme, values);
    } catch(e) {
      return null;
    }
    return markDataRange([values[0]].concat(breaks, [values[values.length - 1]]), values);
  }
  layout = scheme.layout;
  if (!layout) return null;
  stops = internal.getDivergingStops(layout);
  k = (getRampSize(scheme) - 1) / 2;
  tiles = new Array(k * 2 + 1).fill(null);
  markDataRange(stops.below, layout.dataRange).forEach(function(stop, i) {
    tiles[k - stops.below.length + i] = stop;
  });
  if (layout.neutral) tiles[k] = {range: layout.neutral};
  markDataRange(stops.above, layout.dataRange).forEach(function(stop, i) {
    tiles[k + 1 + i] = stop;
  });
  return tiles;
}

// range: ascending values, of which the first is the min and the last the max
function markDataRange(stops, range) {
  var min = range[0], max = range[range.length - 1];
  return stops.map(function(val) {
    return {value: val, min: val == min, max: val == max};
  });
}

// The gradients to draw over the tiles of a continuous scheme, in order:
// [{start, end, flatStart, flatEnd, samples: [{pos, color}]}], with positions
// in tiles (0 is the center of the first tile, 1 of the second...). A
// gradient runs from stop to stop, and holds its end colors over the outer
// halves of its end tiles (flatStart, flatEnd) -- except where the data ends
// between two stops (the shorter side of an equal-interval or nice
// diverging scheme). A pivot class is a gradient of one color, over its
// tile. The samples are of the interpolation -classify does between the
// stops (samplesPerTile to each pair).
export function getContinuousSegments(scheme, samplesPerTile) {
  var colors = getSchemeColors(scheme);
  var layout = scheme.layout;
  var steps = samplesPerTile || 6;
  var segments = [];
  var stops, k, first, last;
  if (!isContinuousScheme(scheme)) return [];
  if (scheme.type == 'sequential') {
    return [makeSegment(colors, 0, 0, colors.length - 1, steps)];
  }
  if (!layout) return [];
  stops = internal.getDivergingStops(layout);
  k = (colors.length - 1) / 2;
  if (stops.below.length > 0) {
    first = k - stops.below.length;
    segments.push(makeSegment(colors.slice(first, k), first,
      first + internal.getStopPosition(stops.below, layout.dataRange[0]), k - 1, steps));
  }
  if (layout.neutral) {
    segments.push(makeSegment([colors[k]], k, k, k, steps));
  }
  if (stops.above.length > 0) {
    last = k + stops.above.length;
    segments.push(makeSegment(colors.slice(k + 1, last + 1), k + 1,
      k + 1, k + 1 + internal.getStopPosition(stops.above, layout.dataRange[1]), steps));
  }
  return segments;
}

// colors: the stops' colors, the first at tile first
// start, end: where the gradient starts and ends, in tiles
function makeSegment(colors, first, start, end, steps) {
  var last = first + colors.length - 1;
  var getColor = colors.length > 1 ?
    internal.getInterpolatedValueGetter(colors, null, {interpolation: 'oklch'}) : null;
  var samples = [];
  var sample = function(pos) {
    samples.push({pos: pos, color: getColor ? toHex(getColor(pos - first)) : colors[0]});
  };
  sample(start);
  for (var i=Math.floor(start * steps) + 1; i / steps < end; i++) {
    sample(i / steps);
  }
  if (end > start) sample(end);
  return {start: start, end: end, flatStart: start == first, flatEnd: end == last, samples: samples};
}

// The data range of each class of a diverging layout, in class order:
// [low, high), with -Infinity and Infinity at the outer ends
export function getDivergingClassRanges(layout) {
  return getBreakRanges(layout ? layout.breaks : []);
}

// The data range of each class of a sequential scheme, as -classify finds
// them (see getDivergingClassRanges()), or null if there are no data
export function getSequentialClassRanges(scheme, lyr) {
  var values = getAscendingValues(lyr, scheme.field);
  if (values.length === 0) return null;
  if (isElevationScheme(scheme)) return getBreakRanges(getElevationClassBreaks(scheme, lyr));
  try {
    return getBreakRanges(getSequentialSchemeBreaks(scheme, values));
  } catch(e) {
    return null;
  }
}

// The inner breaks of a sequential scheme: of its classes, or for continuous
// colors, the stops between the min and the max
function getSequentialSchemeBreaks(scheme, values) {
  var continuous = isContinuousScheme(scheme);
  if (scheme.method == 'breaks') return scheme.breaks.concat();
  return internal.getSequentialBreaks(values, scheme.method, continuous ? scheme.n - 2 : scheme.n - 1, continuous);
}

// Custom breaks. A scheme whose method is 'breaks' has class breaks of its
// own (scheme.breaks), started from another method's (scheme.baseMethod).
// It goes back to that method when a change leaves the breaks with nothing
// to mean: a new field, pivot or pivot class, switching between classes and
// continuous colors, or for a diverging scheme, a new number of classes.
// The breaks are those of getSchemeBreaks(); a diverging scheme also keeps
// its pivot as a number (scheme.breakPivot).

// The breaks the class breaks dialog edits: {breaks, fixed, pivot, neutral,
// min, max}, or null if there are no data. Sequential: the breaks of
// getSequentialSchemeBreaks(). Diverging: all the breaks of the layout,
// including the pivot, which is fixed (fixed[i] is true), or the edges of
// the pivot class (neutral: [lo, hi]). min and max: the data's.
export function getSchemeBreaks(scheme, lyr) {
  var values = getAscendingValues(lyr, scheme.field);
  var layout = scheme.layout;
  var breaks;
  if (values.length === 0 || scheme.type == 'categorical') return null;
  if (isElevationScheme(scheme)) return getElevationBreaks(scheme, lyr, values);
  if (scheme.type == 'diverging') {
    if (!layout) return null;
    return {
      breaks: layout.breaks.concat(),
      fixed: layout.breaks.map(function(b) { return !layout.neutral && b == tidyNumber(layout.pivot); }),
      pivot: tidyNumber(layout.pivot),
      neutral: layout.neutral,
      min: values[0],
      max: values[values.length - 1]
    };
  }
  try {
    breaks = getSequentialSchemeBreaks(scheme, values);
  } catch(e) {
    return null;
  }
  return {
    breaks: breaks,
    fixed: breaks.map(function() { return false; }),
    pivot: null,
    neutral: null,
    min: values[0],
    max: values[values.length - 1]
  };
}

// Fixed elevations: every stop is a break, the end stops too. The range runs
// from the stop at or below the data's min (or the min, if no stop is) to the
// stop at or above its max, so that stops far from the data may be outside it.
// The sea's range runs from its deepest stop (or the data's min) to its top
// stop, leaving out the land.
function getElevationBreaks(scheme, lyr, values) {
  var breaks = getElevationSchemeStops(scheme, lyr);
  var lo = values[0], hi = values[values.length - 1];
  var below = breaks.filter(function(b) { return b <= lo; });
  var above = breaks.filter(function(b) { return b >= hi; });
  var min = below.length > 0 ? below[below.length - 1] : lo;
  return {
    breaks: breaks,
    fixed: breaks.map(function() { return false; }),
    pivot: null,
    neutral: null,
    min: scheme.bathymetric ? Math.min(min, breaks[0]) : min,
    max: above.length > 0 ? above[0] : scheme.bathymetric ? breaks[breaks.length - 1] : hi
  };
}

// Moves break i to a value, as far as it can go: between its neighbors (and
// the data's min and max), and for an edge of a pivot class, on its own side
// of the pivot. The pivot itself doesn't move. A scheme that isn't custom
// yet becomes custom, starting from the breaks its method gives. A stop of
// fixed elevations goes anywhere between its neighbors.
export function setSchemeBreak(scheme, lyr, i, value) {
  var info = getSchemeBreaks(scheme, lyr);
  var breaks, lo, hi, edge, next;
  if (!info || !(i >= 0 && i < info.breaks.length) || info.fixed[i] || !isFiniteNumber(value)) return scheme;
  breaks = info.breaks.map(tidyNumber);
  value = tidyNumber(value);
  if (isElevationScheme(scheme)) {
    breaks[i] = clamp(value, i > 0 ? breaks[i - 1] : -Infinity, i < breaks.length - 1 ? breaks[i + 1] : Infinity);
    return Object.assign({}, scheme, {stops: breaks});
  }
  lo = i > 0 ? breaks[i - 1] : Math.min(info.min, breaks[i]);
  hi = i < breaks.length - 1 ? breaks[i + 1] : Math.max(info.max, breaks[i]);
  edge = info.neutral ? info.neutral.indexOf(breaks[i]) : -1;
  if (edge === 0) hi = Math.min(hi, info.pivot);
  if (edge == 1) lo = Math.max(lo, info.pivot);
  value = clamp(value, lo, hi);
  // the pivot class has to keep the pivot inside it
  if (edge > -1 && value == info.pivot) return scheme;
  breaks[i] = value;
  next = Object.assign({}, scheme, {
    method: 'breaks',
    baseMethod: scheme.method == 'breaks' ? scheme.baseMethod : scheme.method,
    breaks: breaks,
    breakPivot: info.pivot
  });
  // e.g. a pivot without a pivot class that isn't one of the breaks, since
  // the data are all on one side of it
  if (scheme.type == 'diverging' && !getDivergingLayout(next, lyr)) return scheme;
  return next;
}

// The way -classify writes the breaks of a diverging layout, so that a
// pivot written the same way is still one of them
function tidyNumber(val) {
  return isFinite(val) ? +val.toPrecision(12) : val;
}

// A custom scheme back to the method its breaks came from
export function resetSchemeBreaks(scheme) {
  if (scheme.method != 'breaks') return scheme;
  return Object.assign({}, scheme, {
    method: scheme.baseMethod || 'quantile',
    baseMethod: null,
    breaks: null,
    breakPivot: null
  });
}

// Custom breaks for a new number of colors: a break is added by splitting
// the class with the most features at its median, and taken away from
// between the two neighboring classes with the fewest features between them.
// Returns null if the data can't be split into enough classes.
// values: the data, ascending
export function resizeBreaks(breaks, values, numBreaks) {
  var counts, best, i, j, members, mid;
  breaks = breaks.concat();
  while (breaks.length > numBreaks) {
    counts = getClassCounts(breaks, values);
    best = 0;
    for (i=1; i<breaks.length; i++) {
      if (counts[i] + counts[i + 1] < counts[best] + counts[best + 1]) best = i;
    }
    breaks.splice(best, 1);
  }
  while (breaks.length < numBreaks) {
    best = -1;
    for (j=0; j<=breaks.length; j++) {
      members = getClassMembers(breaks, values, j);
      // a class of one value can't be split
      if (members.length > 1 && members[0] < members[members.length - 1] &&
          (best == -1 || members.length > getClassMembers(breaks, values, best).length)) {
        best = j;
      }
    }
    if (best == -1) return null;
    members = getClassMembers(breaks, values, best);
    mid = members[Math.floor(members.length / 2)];
    // a break at the class's lowest value would leave the class below it empty
    if (mid == members[0]) mid = members.find(function(val) { return val > members[0]; });
    breaks.splice(best, 0, mid);
  }
  return breaks;
}

// The colors of the classes between a scheme's breaks (see getSchemeBreaks()),
// as CSS backgrounds: a class's color, or for continuous colors, a gradient
// from the color at the class's low end to the one at its high end
export function getBreakClassSwatches(scheme) {
  var colors = getSchemeColors(scheme);
  var layout = scheme.layout;
  var swatches = [];
  var k, stops;
  if (isElevationScheme(scheme)) {
    // the end colors go on past the end stops; a class has its low stop's color
    return [colors[0]].concat(colors.slice(1).map(function(color, i) {
      return isContinuousScheme(scheme) ? gradient(colors[i], color) : colors[i];
    }), [colors[colors.length - 1]]);
  }
  if (scheme.type == 'sequential') {
    if (!isContinuousScheme(scheme)) return colors;
    return colors.slice(1).map(function(color, i) { return gradient(colors[i], color); });
  }
  if (!layout) return [];
  if (!scheme.continuous) {
    k = getDivergingTileUse(scheme);
    return colors.filter(function(c, i) { return k[i]; });
  }
  // each side's stops have tiles running out from the center tile
  k = getCenterTile(scheme);
  stops = internal.getDivergingStops(layout);
  addSideGradients(k - stops.below.length, stops.below.length);
  if (layout.neutral) swatches.push(colors[k]);
  addSideGradients(k + 1, stops.above.length);
  return swatches;

  function addSideGradients(first, n) {
    for (var i=first; i<first + n - 1; i++) swatches.push(gradient(colors[i], colors[i + 1]));
  }

  function gradient(a, b) {
    return 'linear-gradient(' + a + ', ' + b + ')';
  }
}

// The number of features in each class between a scheme's breaks
export function getBreakClassCounts(scheme, lyr, breaks) {
  return getClassCounts(breaks, getAscendingValues(lyr, scheme.field));
}

// the number of values in each class (classes are [low, high), as -classify has them)
// values: ascending
function getClassCounts(breaks, values) {
  var counts = [];
  var lo, hi;
  for (var j=0; j<=breaks.length; j++) {
    lo = j > 0 ? countValuesBelow(values, breaks[j - 1]) : 0;
    hi = j < breaks.length ? countValuesBelow(values, breaks[j]) : values.length;
    counts.push(Math.max(hi - lo, 0));
  }
  return counts;
}

// the number of ascending values less than val
function countValuesBelow(values, val) {
  var lo = 0, hi = values.length, mid;
  while (lo < hi) {
    mid = (lo + hi) >>> 1;
    if (values[mid] < val) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function getClassMembers(breaks, values, j) {
  var lo = j > 0 ? breaks[j - 1] : -Infinity;
  var hi = j < breaks.length ? breaks[j] : Infinity;
  return values.filter(function(val) { return val >= lo && val < hi; });
}

// The scheme's field's numeric values, ascending
export function getSchemeValues(scheme, lyr) {
  return getAscendingValues(lyr, scheme.field);
}

// Positions along the class breaks dialog's histogram (0 to 1) for values
// from min to max, on a linear or log scale. A log scale of a range that
// reaches 0 or below is of the distance above the min, plus a thousandth of
// the range, so that it spans three powers of ten.
export function getBreaksScale(min, max, log) {
  var shift = log && !(min > 0) ? (max - min) / 1000 - min : 0;
  var f = log ? function(val) { return Math.log(val + shift); } : function(val) { return val; };
  var a = f(min), b = f(max);
  return {
    toPos: function(val) {
      if (!(b > a)) return 0.5;
      if (log && !(val + shift > 0)) return 0;
      return clamp((f(val) - a) / (b - a), 0, 1);
    },
    toValue: function(pos) {
      var val = a + clamp(pos, 0, 1) * (b - a);
      if (!(b > a)) return min;
      return log ? Math.exp(val) - shift : val;
    }
  };
}

// The number of values in each of numBins equal parts of a scale
export function getHistogram(values, scale, numBins) {
  var bins = new Array(numBins).fill(0);
  values.forEach(function(val) {
    bins[Math.min(Math.floor(scale.toPos(val) * numBins), numBins - 1)]++;
  });
  return bins;
}

// The roundest number from a to b: of the ones with the fewest significant
// digits, the nearest the middle, for a break dragged to a position that a
// range of values shares
export function getRoundestNumber(a, b) {
  var lo = Math.min(a, b), hi = Math.max(a, b);
  var mid = (lo + hi) / 2;
  var exp, step, val;
  if (lo <= 0 && hi >= 0) return 0;
  exp = Math.floor(Math.log10(Math.max(Math.abs(lo), Math.abs(hi))));
  for (var e=exp; e > exp - 15; e--) {
    step = Math.pow(10, e);
    val = Math.round(mid / step) * step;
    if (val < lo || val > hi) val = Math.ceil(lo / step) * step;
    if (val <= hi) return +val.toPrecision(12);
  }
  return lo;
}

function getBreakRanges(breaks) {
  var ranges = [];
  for (var i=0; i<=breaks.length; i++) {
    ranges.push([i > 0 ? breaks[i - 1] : -Infinity, i < breaks.length ? breaks[i] : Infinity]);
  }
  return ranges;
}

// How the data falls around the pivot of a diverging scheme:
// {pivot, below, above} (features below the pivot, and at or above it)
export function getPivotSummary(scheme, lyr) {
  var values = getAscendingValues(lyr, scheme.field);
  var pivot = scheme.layout ? scheme.layout.pivot : null;
  if (pivot === null) return null;
  var below = countValuesBelow(values, pivot);
  return {pivot: pivot, below: below, above: values.length - below};
}

// pivot: 'auto', 'median', 'mean' or a number
export function setSchemePivot(scheme, pivot) {
  return Object.assign({}, resetSchemeBreaks(scheme), {pivot: pivot});
}

// sets the pivot class of the scheme's mode (see getSchemeNeutral())
export function setSchemeNeutral(scheme, neutral) {
  return Object.assign({}, resetSchemeBreaks(scheme), scheme.continuous ? {continuousNeutral: !!neutral} : {neutral: !!neutral});
}

// Switching between a total and a number per side starts over with the
// default number
export function setSchemeSplit(scheme, split) {
  if (scheme.split == split) return scheme;
  return Object.assign({}, resetSchemeBreaks(scheme), {
    split: split,
    n: split == 'count' ? defaultDivergingSideClasses : defaultDivergingClasses
  });
}

// By the first text field, or else the first field that can be classified
// by value, or else non-adjacent
export function getDefaultCategoricalScheme(lyr) {
  var fields = getCategoryFields(lyr);
  var records = lyr && lyr.data ? lyr.data.getRecords() : [];
  var field = isRasterLayer(lyr) ? fields[0] || null : fields.find(function(name) {
    return internal.getColumnType(name, records) == 'string';
  }) || fields[0] || null;
  var scheme = {
    type: 'categorical',
    field: field,
    method: field ? 'categorical' : 'non-adjacent',
    n: defaultNonAdjacentColors,
    preset: defaultCategoricalPreset,
    order: null,
    swatches: null
  };
  return field ? setSchemeField(scheme, field, getCategories(lyr, field).length) : scheme;
}

export function getMinSchemeColors(scheme) {
  return scheme.type == 'diverging' && scheme.split == 'count' ? 1 : minSchemeColors;
}

// lyr: the layer, for the fixed elevations of a raster that could hold them
export function getSchemeMethods(scheme) {
  if (scheme.type != 'categorical') return classifyMethods;
  return scheme.raster ? categoricalMethods.filter(function(item) {
    return item.name != 'non-adjacent';
  }) : categoricalMethods;
}

// count: the number of categories, for the categorical method
export function getMaxSchemeColors(scheme, count) {
  var max = maxSchemeColors;
  if (scheme.type == 'diverging' && scheme.split == 'count') return maxDivergingSideClasses;
  if (scheme.type != 'categorical') return max;
  max = scheme.preset ? internal.getCategoricalColors(scheme.preset).length :
    Math.max(maxCategoricalColors, scheme.swatches ? scheme.swatches.length : 0);
  if (scheme.method == 'categorical' && count >= 0) {
    max = Math.min(max, Math.max(count, minSchemeColors));
  }
  return max;
}

function clampColorCount(scheme, n, count) {
  var min = getMinSchemeColors(scheme);
  return clamp(Math.round(n) || min, min, getMaxSchemeColors(scheme, count));
}

// A new field for a categorical scheme gets a swatch for each of its values,
// up to as many as the palette has.
// count: the number of categories in the field
export function setSchemeField(scheme, field, count) {
  var next = Object.assign({}, field == scheme.field ? scheme : resetSchemeBreaks(scheme), {field: field});
  if (next.type == 'categorical' && next.method == 'categorical') {
    next.n = clampColorCount(next, count, count);
  }
  return next;
}

// field, count: the field to use, and its number of categories, when a
// categorical scheme changes to the categorical method
// points: [lon, lat] points across the layer, for choosing fixed elevations'
//   preset
export function setSchemeMethod(scheme, method, field, count, points) {
  var next;
  if (method == 'breaks') return scheme; // the Custom entry: breaks come from the dialog
  if (method == 'elevation') {
    return chooseElevationPreset(resetSchemeBreaks(scheme), scheme.elevationPreset || getDefaultElevationPreset(points));
  }
  next = Object.assign({}, isElevationScheme(scheme) ? leaveFixedElevations(scheme) : resetSchemeBreaks(scheme), {method: method});
  if (next.type != 'categorical') return next;
  if (method == 'categorical') {
    return setSchemeField(next, next.field || field, count);
  }
  return setTileCount(next, defaultNonAdjacentColors);
}

// Fields that a categorical scheme can classify: text and numbers. The
// fill field is left out, since the scheme writes over it.
// On a raster, integer bands with few enough values (see
// getRasterCategoryFields()).
export function getCategoryFields(lyr) {
  var records = lyr && lyr.data ? lyr.data.getRecords() : [];
  if (isRasterLayer(lyr)) return getRasterCategoryFields(lyr);
  if (!lyr || !lyr.data) return [];
  return lyr.data.getFields().filter(function(field) {
    var type = internal.getColumnType(field, records);
    return field != 'fill' && (type == 'string' || type == 'number');
  });
}

// The values of a field, in the order -classify gives them swatches. Empty
// values are left out, as -classify leaves them out: they are no data.
export function getCategories(lyr, field) {
  if (isRasterLayer(lyr)) return getRasterBandCategories(lyr, field);
  if (!lyr || !lyr.data || !field || !lyr.data.fieldExists(field)) return [];
  return internal.getUniqFieldValues(lyr.data.getRecords(), field).filter(isCategoryValue);
}

// The name of a category: a raster's, from its file or an imported palette,
// or null
export function getCategoryName(scheme, lyr, val) {
  var names = getSchemeCategoryNames(scheme);
  var name = names ? names[val] : null;
  if (!name && isRasterLayer(lyr)) name = getRasterCategoryName(lyr, scheme.field, val);
  return name || null;
}

// {<value>: name} that an imported palette gave the scheme's field, or null
// scheme.categoryNames: {field, names}
function getSchemeCategoryNames(scheme) {
  var o = scheme.categoryNames;
  return o && o.field == scheme.field ? o.names : null;
}

// The same test as -classify's (0 is a value; null, undefined, '' and NaN
// are not)
function isCategoryValue(val) {
  return !!val || val === 0;
}

// How many features (or pixels) the scheme gives the no-data color
export function getNoDataCount(lyr, scheme) {
  var records, test, counts;
  if (isRasterLayer(lyr)) {
    counts = getRasterBandCounts(lyr, scheme.field);
    return counts ? counts.total - counts.count : 0;
  }
  if (!lyr || !lyr.data || !scheme.field || scheme.method == 'non-adjacent' ||
      !lyr.data.fieldExists(scheme.field)) return 0;
  records = lyr.data.getRecords();
  test = scheme.type == 'categorical' ? isCategoryValue : isFiniteNumber;
  return records.filter(function(rec) {
    return !test(rec ? rec[scheme.field] : undefined);
  }).length;
}

function isFiniteNumber(val) {
  return typeof val == 'number' && isFinite(val);
}

// null: transparent (raster schemes only)
export function getSchemeNullColor(scheme) {
  if (scheme.raster) return scheme.nullColor || null;
  return scheme.nullColor || defaultNullColor;
}

// An empty or unreadable color is the default
export function setSchemeNullColor(scheme, color) {
  var rgb = color ? internal.parseColor(color) : null;
  var fallback = scheme.raster ? null : defaultNullColor;
  return Object.assign({}, scheme, {nullColor: rgb ? internal.formatColor(rgb) : fallback});
}

// The categories each swatch colors, as -classify assigns them
export function getSwatchCategories(categories, n) {
  var groups = [];
  for (var i=0; i<n; i++) groups.push([]);
  categories.forEach(function(val, i) {
    groups[i % n].push(val);
  });
  return groups;
}

export function getDefaultScheme(field) {
  return {
    type: 'sequential',
    field: field || null,
    method: 'quantile',
    n: 5,
    preset: null,
    reversed: false,
    pins: [{t: 0, color: defaultEnds[0]}, {t: 1, color: defaultEnds[1]}],
    vibrance: defaultVibrance
  };
}

export function getSchemeColors(scheme) {
  return getSchemeTiles(scheme).map(function(tile) {
    return tile.color;
  });
}

// One object per tile: {color, pinned, adjusted, ...}, where adjusted means
// an interpolated color was moved to fit the sRGB gamut (see resolveRampTiles())
export function getSchemeTiles(scheme) {
  var colors;
  if (scheme.type == 'categorical') {
    return getCategoricalPalette(scheme).slice(0, scheme.n).map(function(color) {
      return {color: color, pinned: false, adjusted: false};
    });
  }
  if (isElevationScheme(scheme)) {
    colors = getElevationPresetColors(scheme.elevationPreset);
    return (isBlendedScheme(scheme) ? getBlendedColors(scheme, scheme.elevationPreset) :
        scheme.stopColors || colors).map(function(color, i) {
      return {color: color, pinned: color != colors[i], adjusted: false};
    });
  }
  if (scheme.preset) {
    colors = scheme.range ? getPresetSection(scheme, getRampSize(scheme), scheme.range) :
      getPresetColors(scheme.preset, getRampSize(scheme));
    if (scheme.reversed) colors.reverse();
    return colors.map(function(color) {
      return {color: color, pinned: false, adjusted: false};
    });
  }
  return internal.resolveRampTiles(scheme.pins, getRampSize(scheme), {
    vibrance: getSchemeVibrance(scheme),
    hue: scheme.longHue && scheme.type != 'diverging' ? 'longer' : 'shorter'
  });
}

export function getSchemeVibrance(scheme) {
  return scheme.vibrance >= 0 ? scheme.vibrance : defaultVibrance;
}

export function setSchemeVibrance(scheme, vibrance) {
  vibrance = clamp(+vibrance || 0, 0, maxVibrance);
  return Object.assign({}, scheme, {vibrance: vibrance});
}

// longHue: hues go the long way around the color wheel between pinned colors
export function setSchemeLongHue(scheme, longHue) {
  return Object.assign({}, scheme, {longHue: !!longHue});
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

export function getPresetColors(name, n) {
  return internal.getColorRamp(name, n).map(toHex);
}

// The part of a sequential or diverging preset that its tiles are taken
// from: {start, end, base}, 0-1 in the preset's own direction (before
// reversing). A diverging range is the same on both sides of the center.
// base is the number of tiles when the range was first narrowed: a preset
// with a hand-picked set of that size (ColorBrewer's) is interpolated
// between the set's colors, so that trimming an end tile's width off the
// range, with one tile fewer, leaves the others as they were.
var minRangeSpan = 0.1;

export function getSchemeRange(scheme) {
  return scheme.range || {start: 0, end: 1, base: getRampSize(scheme)};
}

export function hasSchemeRange(scheme) {
  return !!scheme.preset && scheme.type != 'categorical' && !isElevationScheme(scheme);
}

// The range as positions along the tiles, left to right: [left, right]
export function getDisplayRange(scheme) {
  var range = getSchemeRange(scheme);
  return scheme.reversed ? [1 - range.end, 1 - range.start] : [range.start, range.end];
}

// Moves one end of the range, given as a position along the tiles (0-1,
// left to right); a diverging range moves at both ends.
// side: 'left' or 'right'
export function setSchemeRangeEnd(scheme, side, pos) {
  var display = getDisplayRange(scheme);
  var left = display[0], right = display[1];
  pos = clamp(+pos || 0, 0, 1);
  if (scheme.type == 'diverging') {
    left = side == 'left' ? pos : 1 - pos;
    left = clamp(left, 0, (1 - minRangeSpan) / 2);
    right = 1 - left;
  } else if (side == 'left') {
    left = Math.min(pos, right - minRangeSpan);
  } else {
    right = Math.max(pos, left + minRangeSpan);
  }
  return setDisplayRange(scheme, left, right);
}

export function resetSchemeRange(scheme) {
  return Object.assign({}, scheme, {range: null});
}

function setDisplayRange(scheme, left, right) {
  var base = getSchemeRange(scheme).base;
  var start = scheme.reversed ? 1 - right : left;
  var end = scheme.reversed ? 1 - left : right;
  if (start <= 0 && end >= 1) return resetSchemeRange(scheme);
  return Object.assign({}, scheme, {range: {start: Math.max(start, 0), end: Math.min(end, 1), base: base}});
}

// The whole of a preset, left to right, as the range's strip shows it
export function getRangeStripColors(scheme, n) {
  var colors = getPresetSection(scheme, n, {start: 0, end: 1, base: getSchemeRange(scheme).base});
  return scheme.reversed ? colors.reverse() : colors;
}

function getPresetSection(scheme, n, range) {
  return internal.getColorRampSection(scheme.preset, n, range.start, range.end, range.base).map(toHex);
}

// All the swatches of a categorical scheme, in order: the first n are used
export function getCategoricalPalette(scheme) {
  var colors;
  if (!scheme.preset) return scheme.swatches.concat();
  colors = getCategoricalPresetColors(scheme.preset);
  if (!scheme.order) return colors;
  return scheme.order.map(function(i) { return colors[i]; });
}

export function getCategoricalPresetColors(name) {
  return internal.getCategoricalColors(name).map(toHex);
}

// A list of n colors, starting with the given ones and going on with colors
// they don't have yet
function extendSwatches(colors, n) {
  var swatches = colors.slice(0, n);
  getCategoricalPresetColors(extraSwatchSource).forEach(function(color) {
    if (swatches.length < n && !swatches.includes(color)) {
      swatches.push(color);
    }
  });
  return internal.wrapColors(swatches, n);
}

// One boolean per tile: whether the user set its color.
export function getPinnedTiles(scheme) {
  if (isElevationScheme(scheme)) {
    return getSchemeTiles(scheme).map(function(tile) { return tile.pinned; });
  }
  if (scheme.preset || scheme.type == 'categorical') {
    return new Array(getRampSize(scheme)).fill(false);
  }
  return internal.getPinnedSlots(scheme.pins, getRampSize(scheme)).map(function(pinId) {
    return pinId > -1;
  });
}

// count: the number of categories, for a categorical scheme
export function choosePreset(scheme, name, count) {
  var next, size;
  if (isElevationScheme(scheme)) return chooseElevationPreset(scheme, name);
  if (scheme.type == 'categorical') {
    next = Object.assign({}, scheme, {preset: name, order: null, swatches: null});
    next.n = clampColorCount(next, next.n, count);
    return next;
  }
  next = Object.assign({}, scheme, {preset: name, reversed: false, pins: null, range: null});
  // a hand-picked set starts with its own colors
  size = internal.getColorSchemeSetSize(name);
  if (size > 0 && next.type == 'sequential') {
    next = setTileCount(next, size);
  }
  if (size > 0 && next.type == 'diverging') {
    next = chooseDivergingSet(next, name, size);
  }
  return next;
}

export function isElevationScheme(scheme) {
  return scheme.method == 'elevation';
}

// One preset's colors can be classes, with a class from each stop up to the
// next, and the first class reaching down to the sea (a blend, which only
// -classify hypsometric= draws, is always continuous)
export function canClassifyElevations(scheme) {
  return isElevationScheme(scheme) && !isBlendedScheme(scheme) && !isLandTransparent(scheme);
}

// The inner breaks of classed elevations: every stop but the first
function getElevationClassBreaks(scheme, lyr) {
  return getElevationSchemeStops(scheme, lyr).slice(1);
}

export function canUseFixedElevations(scheme, lyr) {
  return scheme.type == 'sequential' && isRasterLayer(lyr) && rasterBandCouldBeElevation(lyr, scheme.field);
}

// The panel tab of a scheme
export function getSchemeTab(scheme) {
  return isElevationScheme(scheme) ? 'elevation' : scheme.type;
}

// The bands of a raster that could hold elevations, for the elevation tab
export function getElevationFields(lyr) {
  if (!isRasterLayer(lyr)) return [];
  return getNumericFields(lyr).filter(function(field) {
    return rasterBandCouldBeElevation(lyr, field);
  });
}

// Whether a raster says that it holds elevations, so that the panel opens on
// the elevation tab
export function layerHasElevations(lyr) {
  return getElevationFields(lyr).some(function(field) {
    return rasterBandIsElevation(lyr, field);
  });
}

// The sea of a fixed-elevation scheme, as a fixed-elevation scheme of its
// own (with a bathymetric preset), for the tiles and the class breaks dialog;
// or null if the sea is left out
export function getSeaScheme(scheme) {
  var sea = scheme.seaScheme;
  if (!sea) return null;
  return Object.assign({type: 'sequential', method: 'elevation', continuous: true, nullColor: null}, sea,
    {field: scheme.field, raster: scheme.raster, bathymetric: true});
}

// @sea: an edited sea scheme (see getSeaScheme()), or null to leave out the sea
export function setSeaScheme(scheme, sea) {
  var next = Object.assign({}, scheme, {
    seaScheme: sea ? {elevationPreset: sea.elevationPreset, preset: sea.preset, stopColors: sea.stopColors || null,
      stops: sea.stops || null, n: sea.n} : null
  });
  // something has to be colored
  if (!sea && scheme.landTransparent) next.landTransparent = false;
  return next;
}

// @name: a bathymetric preset, or null to leave out the sea
export function chooseSeaPreset(scheme, name) {
  return setSeaScheme(scheme, name ? chooseElevationPreset({}, name) : null);
}

// The name for the sea's menu: 'Transparent', a preset, or 'Custom'
export function getSeaLabel(scheme) {
  var sea = scheme.seaScheme;
  return !sea ? 'Transparent' : sea.preset || 'Custom';
}

export function isLandTransparent(scheme) {
  return !!scheme.landTransparent;
}

// Land without colors leaves only the sea, which then needs some
export function setLandTransparent(scheme, transparent) {
  var next = Object.assign({}, scheme, {landTransparent: !!transparent});
  if (transparent && !next.seaScheme) next = chooseSeaPreset(next, getBathymetricPresetNames()[0]);
  return next;
}

// The preset for the climate across a set of [lon, lat] points (see
// hypsometric-climate.mjs), or Temperate without any on land
export function getDefaultElevationPreset(points) {
  return points && internal.getClimatePreset(points) || 'Temperate';
}

// All the land presets, for the palette menu
export function getElevationPresetNames() {
  return internal.getHypsometricSchemeNames();
}

// The presets of a blend, which share their elevations
export function getClimatePresetNames() {
  return internal.getClimateSchemeNames();
}

// Land (hypsometric) and sea (bathymetric) presets of fixed elevations
function getFixedPresetStops(name) {
  return internal.getHypsometricStops(name) || internal.getBathymetricStops(name);
}

export function getElevationPresetColors(name) {
  return getFixedPresetStops(name).map(function(stop) { return stop.color; });
}

// The elevations of a fixed-elevation scheme's stops, in the band's units
export function getElevationSchemeStops(scheme, lyr) {
  var meters = getRasterUnitMeters(lyr);
  if (scheme.stops) return scheme.stops.concat();
  return getFixedPresetStops(scheme.elevationPreset).map(function(stop) {
    return meters == 1 ? stop.elevation : +(stop.elevation / meters).toPrecision(6);
  });
}

// Blended colors (-classify hypsometric=blended) mix the presets by climate
// across the map, which only the command can do. The tiles and stops are
// those of @points' preset, which the command uses where it can't blend.
export function chooseBlendedElevations(scheme, points) {
  return Object.assign(chooseElevationPreset(scheme, getDefaultElevationPreset(points)), {
    preset: blendedPresetName,
    blended: true,
    continuous: true
  });
}

export function isBlendedScheme(scheme) {
  return !!scheme.blended;
}

// For the Blended item in the palette menu: a color of each preset (as
// recolored in @scheme, if given)
export function getBlendedPresetColors(scheme) {
  return getBlendRampColors(scheme || {}).map(function(ramp) {
    return ramp.colors[2];
  });
}

// The colors of each preset in a blend: [{name, colors}], one at each stop
export function getBlendRampColors(scheme) {
  return getClimatePresetNames().map(function(name) {
    return {name: name, colors: getBlendedColors(scheme, name)};
  });
}

function getBlendedColors(scheme, name) {
  var edited = scheme.blendColors && scheme.blendColors[name];
  return (edited || getElevationPresetColors(name)).concat();
}

// Recolors stop i of the presets @names in a blend; a blend whose presets all
// have their own colors again is Blended
function setBlendStopColor(scheme, names, i, color) {
  var edited = Object.assign({}, scheme.blendColors);
  names.forEach(function(name) {
    var colors = getBlendedColors(scheme, name);
    colors[i] = color;
    if (colors.join() == getElevationPresetColors(name).join()) {
      delete edited[name];
    } else {
      edited[name] = colors;
    }
  });
  var custom = Object.keys(edited).length > 0;
  return Object.assign({}, scheme, {blendColors: custom ? edited : null, preset: custom ? null : blendedPresetName});
}

// The color chips at stop i of a fixed-elevation scheme, for the class
// breaks dialog: [{names, color, edited}]. A blend has a chip for each run of
// neighboring presets with the same color there (names: the presets); other
// schemes have one (names: []).
export function getElevationStopChips(scheme, i) {
  var tile;
  if (!isBlendedScheme(scheme)) {
    tile = getSchemeTiles(scheme)[i];
    return [{names: [], color: tile.color, edited: tile.pinned}];
  }
  return groupColorRuns(getBlendRampColors(scheme), function(colors) { return [colors[i]]; }).map(function(run) {
    return {names: run.names, color: run.colors[0], edited: run.names.some(function(name) {
      return getElevationPresetColors(name)[i] != run.colors[0];
    })};
  });
}

// The swatches of a fixed-elevation scheme's classes, from below the first
// stop to above the last: for each class, lanes [{names, colors: [low, high]}],
// one for each run of neighboring presets of a blend with the same colors at
// both ends of the class (or one lane, names: []). Classed elevations have
// one color from a stop up to the next.
export function getElevationClassLanes(scheme) {
  var ramps = isBlendedScheme(scheme) ? getBlendRampColors(scheme) : [{name: null, colors: getSchemeColors(scheme)}];
  var n = ramps[0].colors.length;
  var continuous = isContinuousScheme(scheme);
  var classes = [];
  for (var j = 0; j <= n; j++) {
    classes.push(groupColorRuns(ramps, function(colors) {
      var low = colors[Math.max(j - 1, 0)];
      return [low, continuous ? colors[Math.min(j, n - 1)] : low];
    }));
  }
  return classes;
}

function groupColorRuns(ramps, getColors) {
  var runs = [];
  ramps.forEach(function(ramp) {
    var colors = getColors(ramp.colors);
    var last = runs[runs.length - 1];
    if (last && last.colors.join() == colors.join()) {
      last.names.push(ramp.name);
    } else {
      runs.push({names: ramp.name ? [ramp.name] : [], colors: colors});
    }
  });
  return runs;
}

// Recolors (or with a null color, resets) the chip at stop i for the presets
// @names (see getElevationStopChips())
export function setElevationChipColor(scheme, names, i, color) {
  if (!isBlendedScheme(scheme)) return color ? setTileColor(scheme, i, color) : clearTileColor(scheme, i);
  return names.reduce(function(memo, name) {
    return setBlendStopColor(memo, [name], i, color ? toHex(color) : getElevationPresetColors(name)[i]);
  }, scheme);
}

// A fixed-elevation scheme with given colors and stops, e.g. an imported
// palette's. Returns null if they don't have one for each of the presets'
// stops. Colors and stops that are a preset's give the preset.
// @base: a fixed-elevation scheme of the layer, for its field and the preset
//   that a blend uses where it can't blend
// spec: {
//   blend: {name: colors} or null   (a blend: the colors of its presets;
//                                    presets left out keep their own)
//   colors: [...] or null           (one preset's colors)
//   preset: name or null            (the preset the colors are edited from)
//   stops: [...] or null            (in the band's units)
//   classed: boolean                (classes from each stop up to the next,
//                                    for one preset's colors)
//   sea: {preset, colors, stops} or null
//   landTransparent: boolean
// }
export function getElevationSchemeFromSpec(base, spec, lyr) {
  var names = spec.blend ? getClimatePresetNames() : getElevationPresetNames();
  var scheme, edited, name, sea, n;
  if (spec.blend) {
    n = getFixedPresetStops(names[0]).length;
    if (spec.stops && spec.stops.length != n) return null;
    edited = {};
    names.forEach(function(name) {
      var colors = spec.blend[name];
      if (colors && colors.join() != getElevationPresetColors(name).join()) edited[name] = colors;
    });
    if (names.some(function(name) { return edited[name] && edited[name].length != n; })) return null;
    scheme = chooseElevationPreset(base, names.includes(base.elevationPreset) ? base.elevationPreset : names[0]);
    edited = Object.keys(edited).length > 0 ? edited : null;
    scheme = Object.assign(scheme, {blended: true, blendColors: edited, preset: edited ? null : blendedPresetName,
      continuous: true});
  } else {
    name = findElevationPreset(names, spec.preset, spec.colors) ||
      findElevationPresetWithStops([base.elevationPreset].concat(names), spec, lyr) || base.elevationPreset || names[0];
    scheme = chooseElevationPreset(base, name);
    n = scheme.n;
    if (spec.stops && spec.stops.length != n) return null;
    if (spec.colors && spec.colors.length != n) return null;
    if (spec.colors && spec.colors.join() != getElevationPresetColors(name).join()) {
      scheme = Object.assign(scheme, {preset: null, stopColors: spec.colors.concat()});
    }
    scheme.continuous = !spec.classed;
  }
  if (spec.stops && spec.stops.join() != getElevationSchemeStops(scheme, lyr).join()) {
    scheme.stops = spec.stops.concat();
  }
  sea = spec.sea ? getSeaSchemeFromSpec(spec.sea, lyr) : null;
  if (spec.sea && !sea) return null;
  scheme = setSeaScheme(scheme, sea);
  return spec.landTransparent ? setLandTransparent(scheme, true) : scheme;
}

// Without a preset, the one of @names that a recolored palette was most
// likely edited from: of those with as many stops as the spec has colors or
// stops (presets differ in their number of stops), those with the spec's
// stops, if any, and of those, the first with the most of the spec's colors
function findElevationPresetWithStops(names, spec, lyr) {
  var n = spec.colors ? spec.colors.length : spec.stops ? spec.stops.length : 0;
  var sized = n > 0 ? names.filter(function(name) {
    return !!name && getFixedPresetStops(name).length == n;
  }) : [];
  var placed = spec.stops ? sized.filter(function(name) {
    return getElevationSchemeStops({elevationPreset: name}, lyr).join() == spec.stops.join();
  }) : [];
  var candidates = placed.length > 0 ? placed : sized;
  var best = null, bestCount = -1;
  candidates.forEach(function(name) {
    var colors = getElevationPresetColors(name);
    var count = spec.colors ? spec.colors.filter(function(c, i) { return c == colors[i]; }).length : 0;
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  });
  return best;
}

// The preset of @names that is @preset (in any case), or that has @colors
function findElevationPreset(names, preset, colors) {
  var key = String(preset || '').toLowerCase();
  return names.find(function(name) { return name.toLowerCase() == key; }) ||
    colors && names.find(function(name) { return getElevationPresetColors(name).join() == colors.join(); }) || null;
}

function getSeaSchemeFromSpec(spec, lyr) {
  var names = getBathymetricPresetNames();
  var name = findElevationPreset(names, spec.preset, spec.colors) ||
    findElevationPresetWithStops(names, spec, lyr) || names[0];
  var sea = chooseElevationPreset({}, name);
  var n = sea.n;
  if (spec.colors && spec.colors.length != n || spec.stops && spec.stops.length != n) return null;
  if (spec.colors && spec.colors.join() != getElevationPresetColors(name).join()) {
    sea = Object.assign(sea, {preset: null, stopColors: spec.colors.concat()});
  }
  if (spec.stops && spec.stops.join() != getElevationSchemeStops(sea, lyr).join()) {
    sea = Object.assign(sea, {stops: spec.stops.concat()});
  }
  return sea;
}

// Classed elevations stay classed with another preset
function chooseElevationPreset(scheme, name) {
  return Object.assign({}, scheme, {
    method: 'elevation',
    preset: name,
    blended: false,
    blendColors: null,
    elevationPreset: name,
    stopColors: null,
    stops: null,
    reversed: false,
    pins: null,
    range: null,
    continuous: !(isElevationScheme(scheme) && scheme.continuous === false),
    landTransparent: false,
    n: getFixedPresetStops(name).length
  });
}

// The colors, spread evenly over the data's range by the method that takes
// over
function leaveFixedElevations(scheme) {
  var colors = getSchemeColors(scheme);
  return Object.assign({}, scheme, {
    preset: null,
    blended: false,
    blendColors: null,
    elevationPreset: null,
    stopColors: null,
    stops: null,
    pins: colors.map(function(color, i) {
      return {t: i / (colors.length - 1), color: color};
    })
  });
}

// A diverging set's classes: its colors on each side, and its center color
// for the pivot class. A set without a center color has no pivot class.
// (A side with more of the data may still get more classes than the set
// has colors, unless the classes are by number per side.)
function chooseDivergingSet(scheme, name, size) {
  var centerless = internal.isCenterlessColorScheme(name);
  var next = centerless ? setSchemeNeutral(scheme, false) : scheme;
  var side = (size - 1) / 2;
  if (next.continuous) return next;
  return setTileCount(next, next.split == 'count' ? side : getSchemeNeutral(next) ? size : size - 1);
}

// The colors that show a preset in the palette menu: a hand-picked set's own
// (without the center color of a diverging set that has no pivot class)
export function getPresetMenuColors(name) {
  var colors = getPresetColors(name, internal.getColorSchemeSetSize(name) || 7);
  if (internal.isCenterlessColorScheme(name)) colors.splice((colors.length - 1) / 2, 1);
  return colors;
}

// A preset as a custom ramp, pinned at its ends, for editing.
export function makeSchemeCustom(scheme) {
  var colors;
  if (!scheme.preset) return scheme;
  if (scheme.type == 'categorical') {
    return Object.assign({}, scheme, {preset: null, order: null, swatches: getCategoricalPalette(scheme)});
  }
  colors = getSchemeColors(scheme);
  return Object.assign({}, scheme, {
    preset: null,
    reversed: false,
    range: null,
    pins: scheme.type == 'diverging' ?
      [{t: 0, color: colors[0]}, {t: 0.5, color: colors[(colors.length - 1) / 2]},
        {t: 1, color: colors[colors.length - 1]}] :
      [{t: 0, color: colors[0]}, {t: 1, color: colors[colors.length - 1]}]
  });
}

// The center tile of a diverging ramp, which stays pinned
export function getCenterTile(scheme) {
  return scheme.type == 'diverging' ? (getRampSize(scheme) - 1) / 2 : -1;
}

// The color to edit for tile i: a pinned tile's own color, which vibrance
// may have raised in the ramp, or else the tile's color
export function getTileEditColor(scheme, i) {
  var slot = scheme.preset || scheme.type == 'categorical' || isElevationScheme(scheme) ? -1 :
    internal.getPinnedSlots(scheme.pins, getRampSize(scheme))[i];
  if (slot > -1) return toHex(scheme.pins[slot].color);
  return getSchemeColors(scheme)[i];
}

export function setTileColor(scheme, i, color) {
  var custom, swatches;
  if (isBlendedScheme(scheme)) return setBlendStopColor(scheme, [scheme.elevationPreset], i, toHex(color));
  if (isElevationScheme(scheme)) return setElevationStopColor(scheme, i, toHex(color));
  custom = makeSchemeCustom(scheme);
  if (custom.type == 'categorical') {
    swatches = custom.swatches.concat();
    swatches[i] = toHex(color);
    return Object.assign({}, custom, {swatches: swatches});
  }
  return Object.assign({}, custom, {
    pins: internal.setRampPin(custom.pins, getRampSize(custom), i, toHex(color))
  });
}

export function clearTileColor(scheme, i) {
  if (isBlendedScheme(scheme)) {
    return setBlendStopColor(scheme, [scheme.elevationPreset], i, getElevationPresetColors(scheme.elevationPreset)[i]);
  }
  if (isElevationScheme(scheme)) {
    return setElevationStopColor(scheme, i, getElevationPresetColors(scheme.elevationPreset)[i]);
  }
  if (scheme.preset || scheme.type == 'categorical' || i == getCenterTile(scheme)) return scheme;
  return Object.assign({}, scheme, {
    pins: internal.clearRampPin(scheme.pins, getRampSize(scheme), i)
  });
}

// A stop's color; the scheme is its preset again when every stop has the
// preset's color
function setElevationStopColor(scheme, i, color) {
  var preset = getElevationPresetColors(scheme.elevationPreset);
  var colors = getSchemeColors(scheme);
  colors[i] = color;
  if (colors.join() == preset.join()) {
    return Object.assign({}, scheme, {preset: scheme.elevationPreset, stopColors: null, blended: false});
  }
  return Object.assign({}, scheme, {preset: null, stopColors: colors, blended: false});
}

// A custom categorical list grows to have at least n swatches.
// count: the number of categories, for a categorical scheme
// lyr: the layer, for a sequential scheme's custom breaks to be split or
//   merged to fit (see resizeBreaks()); without it, or for a diverging scheme,
//   the breaks go back to their method's
export function setTileCount(scheme, n, count, lyr) {
  var next, breaks;
  if (isElevationScheme(scheme)) return scheme; // a tile for each of the preset's stops
  next = Object.assign({}, scheme, {n: clampColorCount(scheme, n, count)});
  if (next.type == 'categorical' && !next.preset && next.swatches.length < next.n) {
    next.swatches = extendSwatches(next.swatches, next.n);
  }
  if (next.method == 'breaks' && next.n != scheme.n) {
    breaks = next.type == 'sequential' && lyr ?
      resizeBreaks(next.breaks, getAscendingValues(lyr, next.field), isContinuousScheme(next) ? next.n - 2 : next.n - 1) : null;
    next = breaks ? Object.assign(next, {breaks: breaks}) : resetSchemeBreaks(next);
  }
  return next;
}

// Moves a categorical swatch to a new place in the palette. Moving one
// into the swatches in use pushes the last of them out of use, and moving one
// out of use brings the first unused one in.
// to: the swatch's index after the move
export function moveSwatch(scheme, from, to) {
  return rearrangeSwatches(scheme, function(items) {
    var item = items.splice(from, 1)[0];
    items.splice(to, 0, item);
    return items;
  });
}

// Shuffles all of a categorical palette's swatches, in use or not, into a
// new order.
// random: a function like Math.random (for testing)
export function shuffleScheme(scheme, random) {
  var rand = random || Math.random;
  return rearrangeSwatches(scheme, function(items) {
    var shuffled, tries = 0;
    do {
      shuffled = shuffle(items.concat(), rand);
    } while (items.length > 1 && ++tries < 10 && shuffled.every(function(item, i) {
      return item == items[i];
    }));
    return shuffled;
  });
}

function shuffle(arr, rand) {
  var j, tmp;
  for (var i=arr.length - 1; i>0; i--) {
    j = Math.floor(rand() * (i + 1));
    tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Presets are rearranged by index, so that they keep their name
function rearrangeSwatches(scheme, rearrange) {
  var order;
  if (scheme.type != 'categorical') return scheme;
  if (!scheme.preset) {
    return Object.assign({}, scheme, {swatches: rearrange(scheme.swatches.concat())});
  }
  order = scheme.order || getCategoricalPresetColors(scheme.preset).map(function(c, i) { return i; });
  return Object.assign({}, scheme, {order: rearrange(order.concat())});
}

export function reverseScheme(scheme) {
  if (scheme.type == 'categorical' || isElevationScheme(scheme)) return scheme;
  if (scheme.preset) {
    return Object.assign({}, scheme, {reversed: !scheme.reversed});
  }
  return Object.assign({}, scheme, {
    pins: scheme.pins.map(function(pin) {
      return {t: 1 - pin.t, color: pin.color};
    }).reverse()
  });
}

// The colors to give -classify: no more than there are categories, for the
// categorical method. A diverging scheme gives all its tiles, from which
// -classify takes the same ones the classes use here (see
// getDivergingClassValues()).
// count: the number of categories
export function getAppliedColors(scheme, count) {
  var colors = getSchemeColors(scheme);
  if (scheme.type == 'categorical' && scheme.method == 'categorical' && count > 0) {
    colors = colors.slice(0, count);
  }
  return colors;
}

// opts.target  a -target value, when the layer is not the active one
// opts.layer   the layer, for the units of a fixed-elevation scheme's stops
//   (beyond its end stops, values take the end colors)
export function formatSchemeCommand(scheme, colors, opts) {
  var parts = ['-classify'];
  var custom = scheme.method == 'breaks';
  if (isElevationScheme(scheme)) return formatElevationCommand(scheme, opts);
  if (scheme.method != 'non-adjacent') {
    parts.push('field=' + quoteCommandValue(scheme.field));
  }
  parts.push('method=' + scheme.method);
  if (custom) {
    parts.push('breaks=' + scheme.breaks.join(','));
  }
  if (scheme.type == 'diverging') {
    // custom breaks give the number of classes
    parts.push('pivot=' + (custom ? tidyNumber(scheme.breakPivot) : scheme.pivot));
    if (!custom) parts.push('classes=' + getDivergingClassesOption(scheme));
    // continuous output has no pivot class by default, classes have one
    if (!getSchemeNeutral(scheme)) parts.push('no-pivot-class');
    else if (scheme.continuous) parts.push('pivot-class');
  } else if (isContinuousScheme(scheme) && !custom) {
    parts.push('classes=' + (scheme.n - 1));
  }
  if (isContinuousScheme(scheme)) {
    // the tiles already have their vibrance, so no vibrance=
    parts.push('continuous');
  }
  parts.push('colors=' + colors.join(','));
  if (getSchemeCategoryNames(scheme) && scheme.method == 'categorical' && opts && opts.layer) {
    parts.push(formatCategoryNamesOption(scheme, opts.layer));
  }
  if (scheme.raster ? !!getSchemeNullColor(scheme) :
      scheme.method != 'non-adjacent' && getSchemeNullColor(scheme) != defaultNullColor) {
    parts.push('null-value=' + getSchemeNullColor(scheme));
  }
  if (opts && opts.target) {
    parts.push('target=' + opts.target);
  }
  return parts.join(' ');
}

// category-names= for a raster scheme with names (e.g. from an imported
// palette): a name for each category, in order, quoted where a name has a
// comma or a quote, and "" for a category without one
function formatCategoryNamesOption(scheme, lyr) {
  var names = getCategories(lyr, scheme.field).map(function(val) {
    var name = getSchemeCategoryNames(scheme)[val] || '';
    return name && !/[,"']/.test(name) ? name : '"' + name.replace(/"/g, '\\"') + '"';
  });
  return 'category-names=' + quoteCommandValue(names.join(','));
}

// Fixed elevations: -classify hypsometric= with the preset (or blended, or
// none for only the sea), and only what was edited: colors= (the land's, or
// a blend's recolored presets by name) and breaks= (every stop), with the
// sea's colors and depths as their sea: lists, and classed. Without a sea,
// hypsometric= leaves it out.
function formatElevationCommand(scheme, opts) {
  var parts = ['-classify', 'field=' + quoteCommandValue(scheme.field)];
  var lyr = opts && opts.layer;
  var land = !isLandTransparent(scheme);
  var sea = getSeaScheme(scheme);
  var colors = [], breaks = [];
  parts.push('hypsometric=' + (!land ? 'none' : isBlendedScheme(scheme) ? 'blended' : scheme.elevationPreset.toLowerCase()));
  if (land && isBlendedScheme(scheme)) {
    getBlendRampColors(scheme).forEach(function(ramp) {
      if (scheme.blendColors && scheme.blendColors[ramp.name]) {
        colors.push(ramp.name.toLowerCase() + ':' + ramp.colors.join(','));
      }
    });
  } else if (land && !scheme.preset) {
    colors.push(getSchemeColors(scheme).join(','));
  }
  if (land && scheme.stops) breaks.push(getElevationSchemeStops(scheme, lyr).join(','));
  if (land && !isContinuousScheme(scheme)) parts.push('classed');
  if (sea) {
    parts.push('sea=' + sea.elevationPreset.toLowerCase());
    if (!sea.preset) colors.push('sea:' + getSchemeColors(sea).join(','));
    if (sea.stops) breaks.push('sea:' + getElevationSchemeStops(sea, lyr).join(','));
  }
  if (colors.length > 0) parts.push('colors=' + colors.join(','));
  if (breaks.length > 0) parts.push('breaks=' + breaks.join(','));
  if (getSchemeNullColor(scheme)) parts.push('null-value=' + getSchemeNullColor(scheme));
  if (opts && opts.target) parts.push('target=' + opts.target);
  return parts.join(' ');
}

export function getNumericFields(lyr) {
  var records = lyr && lyr.data ? lyr.data.getRecords() : [];
  if (isRasterLayer(lyr)) return getRasterBandFields(lyr);
  if (!lyr || !lyr.data) return [];
  return lyr.data.getFields().filter(function(field) {
    return internal.getColumnType(field, records) == 'number';
  });
}

export function setLayerScheme(lyr, scheme) {
  if (!lyr) return;
  if (scheme) {
    layerSchemes.set(lyr, scheme);
  } else {
    layerSchemes.delete(lyr);
  }
}

// The scheme that colored a layer, or null if it has none, or if its fills
// have since been changed some other way.
export function getLayerScheme(lyr) {
  var scheme = lyr ? layerSchemes.get(lyr) : null;
  if (!scheme || !schemeMatchesLayer(scheme, lyr)) return null;
  return scheme;
}

// A categorical scheme for a raster palette that the panel didn't make, such
// as the colors of a palette image, so that opening the panel keeps them; or
// null if the palette isn't categories that the panel can color one by one
export function getRasterPaletteScheme(lyr) {
  var palette = isRasterLayer(lyr) ? getRasterCategoricalPalette(lyr) : null;
  var lookup, categories, colors, scheme;
  if (!palette || !getCategoryFields(lyr).includes(palette.field)) return null;
  lookup = new Map(palette.categories.map(function(val, i) { return [val, palette.colors[i]]; }));
  categories = getCategories(lyr, palette.field);
  colors = categories.map(function(val) { return lookup.has(val) ? toHex(lookup.get(val)) : null; });
  if (colors.length === 0 || colors.length > maxFilePaletteColors || colors.includes(null)) return null;
  scheme = setSchemeLayerType({
    type: 'categorical',
    field: palette.field,
    method: 'categorical',
    n: colors.length,
    preset: null,
    order: null,
    swatches: colors
  }, lyr);
  return getAppliedScheme(scheme, colors, lyr);
}

// Checked from the data rather than kept in step with every edit, so that
// anything that changes the fills -- a -style command, a typed fill color,
// an undo past the scheme -- retires it.
export function schemeMatchesLayer(scheme, lyr) {
  var records, colors, val;
  if (isRasterLayer(lyr)) {
    return !!scheme.paletteKey && scheme.paletteKey == getRasterLayerPaletteKey(lyr);
  }
  if (!lyr || !lyr.data || !scheme.colors) return false;
  if (scheme.method != 'non-adjacent' && !lyr.data.fieldExists(scheme.field)) return false;
  if (isContinuousScheme(scheme)) {
    return !!scheme.fillHash && scheme.fillHash == getFillFingerprint(lyr);
  }
  colors = scheme.colors.map(function(c) { return c.toLowerCase(); });
  records = lyr.data.getRecords();
  for (var i=0; i<records.length; i++) {
    val = records[i] && records[i].fill;
    if (!val || (!colors.includes(String(val).toLowerCase()) && !isNullFill(val, scheme))) {
      return false;
    }
  }
  return true;
}

// A scheme as applied to a layer, with what's needed to check it later
// colors: the colors given to -classify
export function getAppliedScheme(scheme, colors, lyr) {
  var applied = Object.assign({}, scheme, {colors: colors});
  if (isRasterLayer(lyr)) {
    applied.paletteKey = getRasterLayerPaletteKey(lyr);
  } else if (isContinuousScheme(scheme)) {
    applied.fillHash = getFillFingerprint(lyr);
  } else {
    delete applied.fillHash;
  }
  return applied;
}

// A hash of a layer's fill values (FNV-1a, 32 bits)
export function getFillFingerprint(lyr) {
  var records = lyr && lyr.data ? lyr.data.getRecords() : [];
  var hash = 0x811c9dc5;
  var str;
  for (var i=0; i<records.length; i++) {
    str = String(records[i] ? records[i].fill : '') + '\n';
    for (var j=0; j<str.length; j++) {
      hash ^= str.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return records.length + ':' + (hash >>> 0).toString(16);
}

function isNullFill(val, scheme) {
  var color = getSchemeNullColor(scheme);
  val = String(val).toLowerCase();
  // -classify writes its default as #eee
  return val == color || color == defaultNullColor && val == '#eee';
}

function toHex(color) {
  return internal.formatColor(internal.parseColor(color));
}
