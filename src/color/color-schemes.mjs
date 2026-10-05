import { formatStringsAsGrid } from '../utils/mapshaper-logging';
import { print, stop, error, message } from '../utils/mapshaper-logging';
import { getStoppedValues } from '../classification/mapshaper-interpolation';
import utils from '../utils/mapshaper-utils';
import * as d3Scales from 'd3-scale-chromatic';
import { piecewise, interpolateRgb } from 'd3-interpolate';
import { crameriSequential, crameriDiverging, crameriCategorical } from '../color/crameri-schemes';

var index = {
  categorical: [],
  sequential: [],
  rainbow: [],
  diverging: [],
  all: []
};
var ramps;
// interpolators of the ramps that are stored as stops (not from d3)
var stopInterpolators;
// scheme name -> where the scheme comes from (see getColorSchemeGroups())
var sources;
// the order of the sources in lists of schemes
var sourceOrder = ['ColorBrewer', 'Tableau', 'Matplotlib', 'Crameri', 'd3'];
// Schemes are listed by their designers, as far as they're known. 'd3' is
// d3-scale-chromatic's own schemes, and others that it brings in: Turbo
// (Google) and CubehelixDefault (D. A. Green's cubehelix).
var d3Sources = {
  ColorBrewer: 'Accent,Dark2,Paired,Pastel1,Pastel2,Set1,Set2,Set3,' +
    'Blues,Greens,Greys,Purples,Reds,Oranges,BuGn,BuPu,GnBu,OrRd,PuBuGn,PuBu,PuRd,RdPu,YlGnBu,YlGn,YlOrBr,YlOrRd,' +
    'BrBG,PRGn,PiYG,PuOr,RdBu,RdGy,RdYlBu,RdYlGn,Spectral',
  Tableau: 'Tableau10,Tableau20',
  Matplotlib: 'Cividis,Viridis,Magma,Inferno,Plasma',
  d3: 'Category10,Category20,Category20b,Category20c,CubehelixDefault,Rainbow,Warm,Cool,Sinebow,Turbo'
};

function initSchemes() {
  if (ramps) return;
  ramps = {};
  stopInterpolators = {};
  sources = {};
  addSchemesFromD3('categorical', 'Category10,Accent,Dark2,Paired,Pastel1,Pastel2,Set1,Set2,Set3,Tableau10');
  addSchemesFromD3('sequential', 'Blues,Greens,Greys,Purples,Reds,Oranges,BuGn,BuPu,GnBu,OrRd,PuBuGn,PuBu,PuRd,RdPu,YlGnBu,YlGn,YlOrBr,YlOrRd');
  addSchemesFromD3('rainbow', 'Cividis,CubehelixDefault,Rainbow,Warm,Cool,Sinebow,Turbo,Viridis,Magma,Inferno,Plasma');
  addSchemesFromD3('diverging', 'BrBG,PRGn,PiYG,PuOr,RdBu,RdGy,RdYlBu,RdYlGn,Spectral');
  testLib(); // make sure these schemes are all available
  addCategoricalScheme('Category20',
    '1f77b4aec7e8ff7f0effbb782ca02c98df8ad62728ff98969467bdc5b0d58c564bc49c94e377c2f7b6d27f7f7fc7c7c7bcbd22dbdb8d17becf9edae5');
  addCategoricalScheme('Category20b',
    '393b795254a36b6ecf9c9ede6379398ca252b5cf6bcedb9c8c6d31bd9e39e7ba52e7cb94843c39ad494ad6616be7969c7b4173a55194ce6dbdde9ed6');
  addCategoricalScheme('Category20c',
    '3182bd6baed69ecae1c6dbefe6550dfd8d3cfdae6bfdd0a231a35474c476a1d99bc7e9c0756bb19e9ac8bcbddcdadaeb636363969696bdbdbdd9d9d9');
  addCategoricalScheme('Tableau20',
    '4c78a89ecae9f58518ffbf7954a24b88d27ab79a20f2cf5b43989483bcb6e45756ff9d9879706ebab0acd67195fcbfd2b279a2d6a5c99e765fd8b5a5');
  Object.keys(d3Sources).forEach(function(source) {
    d3Sources[source].split(',').forEach(function(name) {
      sources[name] = source;
    });
  });
  addStoppedSchemes('sequential', crameriSequential, 'Crameri');
  addStoppedSchemes('diverging', crameriDiverging, 'Crameri');
  Object.keys(crameriCategorical).forEach(function(name) {
    addCategoricalScheme(name, crameriCategorical[name]);
    sources[name] = 'Crameri';
  });
  index.all = [].concat(index.sequential, index.rainbow, index.diverging, index.categorical);
}

// Ramps stored as evenly spaced colors, interpolated linearly between them
function addStoppedSchemes(type, schemes, source) {
  Object.keys(schemes).forEach(function(name) {
    index[type].push(name);
    stopInterpolators[name] = piecewise(interpolateRgb, unpackRamp(schemes[name]));
    sources[name] = source;
  });
}

function standardName(name) {
  if (!name) return null;
  var lcname = name.toLowerCase();
  for (var i=0; i<index.all.length; i++) {
    if (index.all[i].toLowerCase() == lcname) {
      return index.all[i];
    }
  }
  return null;
}

function addSchemesFromD3(type, namesStr) {
  var names = namesStr.split(',');
  index[type] = index[type].concat(names);
  if (type == 'categorical') {
    // copy categorical colors for simplicity
    names.forEach(name => {
      ramps[name] = d3Scales['scheme' + name];
    });
  }
}

function addCategoricalScheme(name, str) {
  index.categorical.push(name);
  ramps[name] = unpackRamp(str);
}

function unpackRamp(str) {
  var colors = [];
  for (var i=0, n=str.length; i<n; i+=6) {
    colors.push('#' + str.substr(i, 6));
  }
  return colors;
}

function testLib() {
  schemes(index.categorical);
  schemes(index.sequential);
  schemes(index.diverging);
  interpolators(index.sequential);
  interpolators(index.rainbow);
  interpolators(index.diverging);

  function schemes(arr) {
    arr.forEach(function(name) {
      if (!d3Scales['scheme' + name]) {
        message('Warning: missing data for', name);
      }
    });
  }

  function interpolators(arr) {
    arr.forEach(function(name) {
      if (!d3Scales['interpolate' + name]) {
        message('Missing interpolator for', name);
      }
    });
  }
}

export function printColorSchemeNames() {
  var types = [['categorical', 'Categorical'], ['sequential', 'Sequential'],
    ['diverging', 'Diverging'], ['rainbow', 'Multi-hue/rainbow']];
  initSchemes();
  print('Built-in color schemes');
  types.forEach(function(type) {
    getColorSchemeGroups(type[0]).forEach(function(group) {
      print('\n' + type[1] + ' (' + group.source + ')\n' + formatStringsAsGrid(group.names));
    });
  });
}

// type: categorical, sequential, rainbow or diverging
export function getColorSchemeNames(type) {
  initSchemes();
  if (!index[type]) error('Unknown color scheme type:', type);
  return index[type].concat();
}

// The schemes of one or more types, by source: [{source, names}]
// (sources: ColorBrewer, Tableau, Matplotlib, Crameri, d3)
export function getColorSchemeGroups(types) {
  var names = [].concat(types).reduce(function(memo, type) {
    return memo.concat(getColorSchemeNames(type));
  }, []);
  return sourceOrder.map(function(source) {
    return {source: source, names: names.filter(function(name) { return sources[name] == source; })};
  }).filter(function(group) {
    return group.names.length > 0;
  });
}

export function pickRandomColorScheme(type) {
  initSchemes();
  var names = index[type];
  if (!names) error('Unknown color scheme type:', type);
  return utils.pickOne(names);
}

export function pickRandomCategoricalScheme(n) {
  initSchemes();
  var minSize = Math.min(n, 20); // use largest available if n is too large
  var schemes = index.categorical.filter(name => ramps[name].length >= minSize);
  return utils.pickOne(schemes) || 'Tableau20';
}

function randomRotateArr(arr) {
  var n = Math.floor(Math.random() * arr.length);
  return arr.slice(-n).concat(arr.slice(0, -n));
}

export function getRandomizedCategoricalColorScheme(n) {
  var name = pickRandomCategoricalScheme(n);
  return getCategoricalColorScheme(name, n, true);
}

export function getCategoricalColorScheme(name, n, randomized) {
  var colors;
  initSchemes();
  name = standardName(name);
  if (!isColorSchemeName(name)) {
    stop('Unknown color scheme name:', name);
  } else if (isCategoricalColorScheme(name)) {
    colors = ramps[name] || d3Scales['scheme' + name];
  } else {
    colors = getColorRamp(name, n);
  }
  if (n > colors.length) {
    // stop(name, 'does not contain', n, 'colors');
    message('Color scheme has', colors.length, 'colors. Using duplication to match', n, 'categories.');
    colors = wrapColors(colors, n);
  }
  if (randomized) {
    colors = randomRotateArr(colors);
  }
  if (n < colors.length) {
    colors = colors.slice(0, n);
  }
  return colors;
}

// All the colors of a categorical scheme
export function getCategoricalColors(name) {
  initSchemes();
  name = standardName(name);
  if (!isCategoricalColorScheme(name)) stop('Not a categorical color scheme:', name);
  return (ramps[name] || d3Scales['scheme' + name]).concat();
}

export function wrapColors(colors, n) {
  while (colors.length > 0 && colors.length < n) {
    colors = colors.concat(colors.slice(0, n - colors.length));
  }
  return colors;
}

export function isColorSchemeName(name) {
  initSchemes();
  return index.all.includes(standardName(name));
}

export function isCategoricalColorScheme(name) {
  initSchemes();
  return index.categorical.includes(standardName(name));
}

// interpOpts: how stops= colors are interpolated (see getPairInterpolator())
export function getColorRamp(name, n, stops, interpOpts) {
  initSchemes();
  name = standardName(name);
  var ramps = d3Scales['scheme' + name];
  var interpolate = d3Scales['interpolate' + name] || stopInterpolators[name];
  var ramp;
  if (!ramps && !interpolate) {
    stop('Unknown color scheme name:', name);
  }
  if (index.categorical.includes(name)) {
    stop(name, ' is a categorical color scheme (expected a sequential color scheme)');
  }
  if (ramps && ramps[n]) {
    ramp = ramps[n];
  } else {
    ramp = getInterpolatedRamp(interpolate, n);
  }
  if (stops) {
    ramp = getStoppedValues(ramp, stops, interpOpts);
  }
  return ramp;
}

// n colors from part of a ramp, evenly spaced from start to end (0-1).
// base: interpolate between the colors of the scheme's set of this size, if
// it has one (ColorBrewer's hand-picked sets), so that a section of a set
// keeps its colors; otherwise the scheme's own interpolator is used
export function getColorRampSection(name, n, start, end, base) {
  initSchemes();
  name = standardName(name);
  var sets = d3Scales['scheme' + name];
  var interpolate = d3Scales['interpolate' + name] || stopInterpolators[name];
  var colors = [];
  if (!interpolate || index.categorical.includes(name)) {
    stop('Not a sequential or diverging color scheme:', name);
  }
  if (sets && sets[base]) interpolate = piecewise(interpolateRgb, sets[base]);
  for (var i=0; i<n; i++) {
    colors.push(interpolate(n > 1 ? start + (end - start) * i / (n - 1) : (start + end) / 2));
  }
  return colors;
}

function getInterpolatedRamp(interpolate, n) {
  if (n > 0 === false || !utils.isInteger(n)) {
    error('Expected a positive integer');
  }
  var ramp = [];
  for (var i=0; i<n; i++) {
    ramp.push(interpolate(i / (n - 1)));
  }
  return ramp;
}
