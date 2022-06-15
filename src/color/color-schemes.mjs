import { formatStringsAsGrid } from '../utils/mapshaper-logging';
import { print, stop, error, message } from '../utils/mapshaper-logging';
import { getStoppedValues } from '../classification/mapshaper-interpolation';
import utils from '../utils/mapshaper-utils';
import * as d3Scales from 'd3-scale-chromatic';

var index = {
  categorical: [],
  sequential: [],
  rainbow: [],
  diverging: [],
  all: []
};
var ramps;

function initSchemes() {
  if (ramps) return;
  ramps = {};
  addSchemesFromD3('categorical', 'Category10,Accent,Dark2,Paired,Pastel1,Pastel2,Set1,Set2,Set3,Tableau10');
  addSchemesFromD3('sequential', 'Blues,Greens,Greys,Purples,Reds,Oranges,BuGn,BuPu,GnBu,OrRd,PuBuGn,PuBu,PuRd,RdPu,YlGnBu,YlGn,YlOrBr,YlOrRd');
  addSchemesFromD3('rainbow', 'Cividis,CubehelixDefault,Rainbow,Warm,Cool,Sinebow,Turbo,Viridis,Magma,Inferno,Plasma');
  addSchemesFromD3('diverging', 'BrBG,PRGn,PRGn,PiYG,PuOr,RdBu,RdGy,RdYlBu,RdYlGn,Spectral');
  testLib(); // make sure these schemes are all available
  addCategoricalScheme('Category20',
    '1f77b4aec7e8ff7f0effbb782ca02c98df8ad62728ff98969467bdc5b0d58c564bc49c94e377c2f7b6d27f7f7fc7c7c7bcbd22dbdb8d17becf9edae5');
  addCategoricalScheme('Category20b',
    '393b795254a36b6ecf9c9ede6379398ca252b5cf6bcedb9c8c6d31bd9e39e7ba52e7cb94843c39ad494ad6616be7969c7b4173a55194ce6dbdde9ed6');
  addCategoricalScheme('Category20c',
    '3182bd6baed69ecae1c6dbefe6550dfd8d3cfdae6bfdd0a231a35474c476a1d99bc7e9c0756bb19e9ac8bcbddcdadaeb636363969696bdbdbdd9d9d9');
  addCategoricalScheme('Tableau20',
    '4c78a89ecae9f58518ffbf7954a24b88d27ab79a20f2cf5b43989483bcb6e45756ff9d9879706ebab0acd67195fcbfd2b279a2d6a5c99e765fd8b5a5');
  index.all = [].concat(index.sequential, index.rainbow, index.diverging, index.categorical);

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

function addSchemesFromD3(type, names) {
  index[type] = index[type].concat(names.split(','));
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
  initSchemes();
  print('Built-in color schemes (from d3):');
  print ('Categorical\n' + formatStringsAsGrid(index.categorical));
  print ('\nSequential\n' + formatStringsAsGrid(index.sequential));
  print ('\nDiverging\n' + formatStringsAsGrid(index.diverging));
  print ('\nMulti-hue/rainbow\n' + formatStringsAsGrid(index.rainbow));
}

export function pickRandomColorScheme(type) {
  initSchemes();
  var names = index[type];
  if (!names) error('Unknown color scheme type:', type);
  var i = Math.floor(Math.random() * names.length);
  return names[i];
}

export function getRandomColors(n) {
  initSchemes();
  var colors = getCategoricalColorScheme('Tableau20', 20);
  utils.shuffle(colors);
  colors = wrapColors(colors, n);
  return colors.slice(0, n);
}

export function getCategoricalColorScheme(name, n) {
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
  } else {
    colors = colors.slice(0, n);
  }
  return colors;
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

export function getColorRamp(name, n, stops) {
  initSchemes();
  name = standardName(name);
  var ramps = d3Scales['scheme' + name];
  var interpolate = d3Scales['interpolate' + name];
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
    ramp = getStoppedValues(ramp, stops);
  }
  return ramp;
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
