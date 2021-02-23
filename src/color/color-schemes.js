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
  // margin can be set to use a restricted range
  // TODO: make this a parameter
  // var margin = 1 / (n + 4);
  var margin = 0; // use full range
  var interval = (1 - margin * 2) / (n - 1);
  var ramp = [];
  for (var i=0; i<n; i++) {
    ramp.push(interpolate(margin + interval * i));
  }
  return ramp;
}
