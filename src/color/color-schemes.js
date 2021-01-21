import { formatStringsAsGrid } from '../utils/mapshaper-logging';
import { print, stop, error, message } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

var categorical = 'Category10,Accent,Dark2,Paired,Pastel1,Pastel2,Set1,Set2,Set3,Tableau10'.split(',');
var sequential = 'Blues,Greens,Greys,Purples,Reds,Oranges,BuGn,BuPu,GnBu,OrRd,PuBuGn,PuBu,PuRd,RdPu,YlGnBu,YlGn,YlOrBr,YlOrRd'.split(',');
var rainbow = 'Cividis,CubehelixDefault,Rainbow,Warm,Cool,Sinebow,Turbo,Viridis,Magma,Inferno,Plasma'.split(',');
var diverging = 'BrBG,PRGn,PRGn,PiYG,PuOr,RdBu,RdGy,RdYlBu,RdYlGn,Spectral'.split(',');

function testLib() {
  var lib = require('d3-scale-chromatic');
  schemes(categorical);
  schemes(sequential);
  schemes(diverging);
  interpolators(sequential);
  interpolators(rainbow);
  interpolators(diverging);

  function schemes(arr) {
    arr.forEach(function(name) {
      if (!lib['scheme' + name]) {
        message('Warning: missing data for', name);
      }
    });
  }

  function interpolators(arr) {
    arr.forEach(function(name) {
      if (!lib['interpolate' + name]) {
        message('Missing interpolator for', name);
      }
    });
  }
}

export function printColorSchemeNames() {
  testLib();
  print('Built-in color schemes (from d3):');
  print ('Categorical\n' + formatStringsAsGrid(categorical));
  print ('\nSequential\n' + formatStringsAsGrid(sequential));
  print ('\nDiverging\n' + formatStringsAsGrid(diverging));
  print ('\nMulti-hue/rainbow\n' + formatStringsAsGrid(rainbow));
}

export function getCategoricalColorScheme(name, n) {
  if (categorical.includes(name) === false) {
    stop(name, 'is not a categorical color scheme');
  }
  var colors = require('d3-scale-chromatic')['scheme' + name];
  if (n > colors.length) {
    stop(name, 'does not contain', n, 'colors');
  }
  return colors.slice(0, n);
}

export function isColorSchemeName(name) {
  return categorical.concat(sequential).concat(rainbow).concat(diverging).includes(name);
}

// Make an interpolated color ramp (when number of colors is less than the
// number of classes).
export function fillOutRamp(colors, classes) {
  var numPairs = colors.length - 1;
  var breaksPerPair = (classes - colors.length) / numPairs;
  if (!utils.isInteger(breaksPerPair)) {
    // TODO: handle this without erroring
    stop('Number of classes does not evenly match number of colors');
  }
  var colorPairs = getColorPairs(colors);
  var ramp = colorPairs.reduce(function(memo, pair, i) {
    if (i === 0) {
      memo.push(pair[0]);
    }
    memo = memo.concat(findIntermediateColors(pair[0], pair[1], breaksPerPair));
    memo.push(pair[1]);
    return memo;
  }, []);
  return ramp;
}

function getColorPairs(colors) {
  var pairs = [];
  for (var i=1; i<colors.length; i++) {
    pairs.push([colors[i-1], colors[i]]);
  }
  return pairs;
}

function findIntermediateColors(a, b, n) {
  var d3 = require('d3-interpolate');
  var interpolate = d3.interpolate(a, b);
  var colors = [];
  for (var i=0; i<n; i++) {
    colors.push(interpolate((i + 1) / (n + 1)));
  }
  return colors;
}

export function getColorRamp(name, n) {
  var lib = require('d3-scale-chromatic');
  var ramps = lib['scheme' + name];
  var interpolate = lib['interpolate' + name];
  if (!ramps && !interpolate) {
    stop('Unknown color scheme name:', name);
  }
  if (categorical.includes(name)) {
    stop(name, ' is a categorical color scheme (expected a sequential color scheme)');
  }
  if (ramps && ramps[n]) {
    return ramps[n];
  }
  return getInterpolatedRamp(interpolate, n);
}

function getInterpolatedRamp(interpolate, n) {
  if (n > 0 === false || !utils.isInteger(n)) {
    error('Expected a positive integer');
  }
  var margin = 1 / (n + 2);
  var interval = (1 - margin * 2) / (n - 1);
  var ramp = [];
  for (var i=0; i<n; i++) {
    ramp.push(interpolate(margin + interval * i));
  }
  return ramp;
}
