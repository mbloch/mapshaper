
import { exportSVG } from '../svg/mapshaper-svg';
import { importGeoJSON } from '../geojson/geojson-import';
import { writeFiles } from '../io/mapshaper-file-export';
import { getEqualIntervalBreaks, getDistributionData } from '../classification/mapshaper-sequential-classifier';
import { mergeDatasets } from '../dataset/mapshaper-merging';
import { roundToDigits } from '../geom/mapshaper-rounding';
import { stop, message } from '../utils/mapshaper-logging';

function getKeyStyle(type, opts) {
  return {
    width: opts.key_width || type == 'dataviz' && 500 || 300,
    tileHeight: opts.key_tile_height || 10,
    labelSuffix: opts.key_label_suffix || '',
    lastSuffix: opts.key_last_suffix || '',
    chartHeight: 90,
    chartColor: '#ddd',
    ticColor: 'rgba(0,0,0,0.3)',
    ticLen: opts.key_tic_length >= 0 ? +opts.key_tic_length : 6,
    fontFamily: 'sans-serif',
    fontSize: opts.key_font_size || 13,
    textColor: '#555'
  };
}

export function makeSimpleKey(colors, breaks, minVal, maxVal, opts) {
  var style = getKeyStyle('simple', opts);
  var tileWidth = style.width / colors.length;
  var tileData = makeEqualTiles(tileWidth, style.tileHeight, colors);
  var layers = [tileData];
  var labels, tics, ticBreaks;
  if (colors.length == breaks.length + 1) {
    ticBreaks = getEvenlySpacedTicOffsets(breaks.length, style.width);
    labels = getTicLabels(breaks, ticBreaks, 0, style.width, style);
    tics = getTics(ticBreaks, 0, style.width, style);
    layers.push(tics, labels);
  } else if (colors.length == breaks.length + 2) {
    style.ticLen = 2; // kludge for label spacing
    labels = getInlineLabels(getFullBreaks(breaks, minVal, maxVal), style);
    layers.push(labels);
  }
  exportKey(opts.key_name || 'simple-key', layers, style.width);
}

export function makeDatavizKey(colors, breaks, ascending, opts) {
  var style = getKeyStyle('dataviz', opts);
  var minVal = ascending[0];
  var maxVal = ascending[ascending.length - 1];
  var partitions = getFullBreaks(breaks, minVal, maxVal);
  var chart = getReferenceChart(ascending, style);
  var tiles = getProportionalTiles(colors, breaks, minVal, maxVal, style);
  var labels = getTicLabels(partitions, partitions, minVal, maxVal, style);
  var tics = getTics(partitions, minVal, maxVal, style);
  exportKey(opts.key_name || 'dataviz-key', [chart, tiles, tics, labels], style.width);
}

export function makeGradientKey(classify, breaks, minVal, maxVal, opts) {
  var style = getKeyStyle('gradient', opts);
  var partitions = getFullBreaks(breaks, minVal, maxVal);
  var gradient = makeGradient(classify, partitions, style);
  var ticBreaks = getEvenlySpacedTicOffsets(breaks.length, style.width);
  var labels = getTicLabels(breaks, ticBreaks, 0, style.width, style);
  var tics = getTics(ticBreaks, 0, style.width, style);
  var layers = [gradient, tics, labels];
  exportKey(opts.key_name || 'gradient-key', layers, style.width);
}

// export function makeGradientDatavizKey(classify, breaks, ascending, opts) {
//   var style = getKeyStyle('dataviz', opts);
//   var minVal = ascending[0];
//   var maxVal = ascending[ascending.length - 1];
//   var partitions = getFullBreaks(breaks, minVal, maxVal);
//   var chart = getReferenceChart(ascending, style);
//   var gradient = makeGradient(classify, partitions, style);
//   // var tiles = getProportionalTiles(colors, breaks, minVal, maxVal, style);
//   var labels = getTicLabels(partitions, partitions, minVal, maxVal, style);
//   var tics = getTics(partitions, minVal, maxVal, style);
//   exportKey(opts.key_name || 'dataviz-key', [chart, gradient, tics, labels], style.width);
// }

function getXScale(keyWidth, minVal, maxVal) {
  return function(val) {
    return (val - minVal) / (maxVal - minVal) * keyWidth;
  };
}

function getLabelTexts(values, style) {
  var digits = getLabelDigits(values);
  return values.map(function(val, i) {
    var isLast = i == values.length - 1;
    var suffix = isLast && style.lastSuffix || style.labelSuffix || '';
    return roundToDigits(val, digits) + suffix;
  });
}

function getLabelDigits(values) {
  var min = values[0];
  var max = values[values.length - 1];
  var avg = (max - min) / values.length;
  var d = 0;
  if (avg < 1) d = 2;
  else if (avg < 10) d = 1;
  return d;
}

function getEvenlySpacedTicOffsets(n, width) {
  var arr = [];
  for (var i=0; i<n; i++) {
    arr.push((i + 1) / (n + 1) * width);
  }
  return arr;
}

function getTics(breaks, minVal, maxVal, style) {
  var getX = getXScale(style.width, minVal, maxVal);
  var tics = [];
  for (var i=0; i<breaks.length; i++) {
    tics.push(makeTic(getX(breaks[i]), style));
  }
  return featuresToDataset(tics);
}

function getInlineLabels(values, style) {
  var labels = [];
  var texts = getLabelTexts(values, style);
  var dx = getLabelShift(style);
  var x;
  for (var i=0; i<texts.length; i++) {
    x = (i + 0.5) * style.width / texts.length;
    labels.push(makeLabel(texts[i], x, style));
  }
  return featuresToDataset(labels);
}

function getLabelShift(style) {
  // kludge to nudge numbers towards the tic
  return style.labelSuffix ? 3 : 0;
}

function getFullBreaks(innerBreaks, minVal, maxVal) {
  return [minVal].concat(innerBreaks, maxVal);
}

function getTicLabels(values, breaks, minVal, maxVal, style) {
  var texts = getLabelTexts(values, style);
  var getX = getXScale(style.width, minVal, maxVal);
  var labels = [];
  for (var i=0; i<breaks.length; i++) {
    labels.push(makeLabel(texts[i], getX(breaks[i]), style));
  }
  return featuresToDataset(labels);
}

function getProportionalTiles(colors, breaks, minVal, maxVal, style) {
  var arr = getFullBreaks(breaks, minVal, maxVal);
  var getX = getXScale(style.width, minVal, maxVal);
  var tiles = [];
  var x, w;
  for (var i=0; i<arr.length; i++) {
    x = getX(arr[i]);
    w = getX(arr[i+1]) - x;
    tiles.push(makeTile(x, 0, w, style.tileHeight, colors[i]));
  }
  return featuresToDataset(tiles);
}

function getReferenceChart(ascending, style) {
  var barWidth = 5;
  var numBars = Math.floor(style.width / barWidth);
  var breaks = getEqualIntervalBreaks(ascending, numBars - 1);
  var counts = getDistributionData(breaks, ascending);
  var maxCount = Math.max.apply(counts, counts);
  var bars = [];
  var y0 = style.tileHeight; // shift chart above the tiles
  var c, h;
  for (var i=0; i<numBars; i++) {
    c = counts[i];
    if (!c) continue;
    h = c / maxCount * style.chartHeight;
    bars.push(makeTile(i*barWidth, y0, barWidth, h , style.chartColor));
  }
  return featuresToDataset(bars);
}

function exportKey(name, datasets, width) {
  var svgOpts = {
    width: width,
    crisp_paths: true,
    default_linecap: 'butt'
  };
  var filename = name + (name.endsWith('.svg') ? '' : '.svg');
  var dataset = datasets.length == 1 ? datasets[0] : mergeDatasets(datasets);
  var output = exportSVG(dataset, svgOpts);
  output[0].filename = filename;
  writeFiles(output, {});
}

function featuresToDataset(features) {
  var json = {
    type: 'FeatureCollection',
    features: features
  };
  return importGeoJSON(json);
}

function makeGradient(classify, partitions, style) {
  var tiles = [];
  var getVal = pixToValue(partitions, style.width);
  var w = 2;
  for (var x=0; x<style.width; x += w) {
    tiles.push(makeTile(x, 0, w, style.tileHeight, classify(getVal(x))));
  }
  return featuresToDataset(tiles);
}

function pixToValue(partitions, keyWidth) {
  var classes = partitions.length - 1;
  var sectionWidth = keyWidth / classes;
  return function(x) {
    var i = Math.min(Math.floor(x / sectionWidth), classes - 1); // clamp
    var k = (x - i * sectionWidth) / sectionWidth;
    return partitions[i] * (1 - k) + partitions[i+1] * k;
  };
}

function pixToValue2(partitions, keyWidth) {
  var classes = partitions.length - 1;
  var dataRange = partitions[classes] - partitions[0];
  var pixBreaks = partitions.reduce(function(memo, val, i) {
    var x;
    if (i === 0) {
      x = 0;
    } else {
      x = (partitions[i] - partitions[0]) / dataRange * keyWidth;
    }
    memo.push(x);
    return memo;
  }, []);
  var sectionWidth = keyWidth / classes;
  return function(x) {
    var i = Math.min(Math.floor(x / sectionWidth), classes - 1); // clamp
    var k = (x - i * sectionWidth) / sectionWidth;
    return partitions[i] * (1 - k) + partitions[i+1] * k;
  };
}


function makeEqualTiles(w, h, colors) {
  var tiles = [];
  for (var i=0; i<colors.length; i++) {
    tiles.push(makeTile(i * w, 0, w, h, colors[i]));
  }
  return featuresToDataset(tiles);
}

function getRectangle(x, y, w, h) {
  return [[x, y], [x, y+h], [x+w, y+h], [x+w, y], [x, y]];
}

function makeLabel(str, x, style) {
  var y = -(style.ticLen + style.fontSize * 0.7 + 4);
  var align;
  if (x <= 0) {
    align = 'start';
  } else if (x >= style.width) {
    align = 'end';
  } else {
    align = 'middle';
    x += getLabelShift(style);
  }
  return {
    type: 'Feature',
    properties: {
      'label-text': str,
      'font-family': style.fontFamily,
      'font-size': style.fontSize,
      'text-anchor': align,
      fill: style.textColor
    },
    geometry: {
      type: 'Point',
      coordinates: [x, y]
    }
  };
}

function makeTic(x, style) {
  var y = style.tileHeight;
  var h = style.tileHeight + style.ticLen;
  return {
    type: 'Feature',
    properties: { stroke: style.ticColor },
    geometry: {
      type: 'LineString',
      coordinates: [[x, y], [x, y - h]]
    }
  };
}

function makeTile(x, y, w, h, fill) {
  var coords = getRectangle(x, y, w, h);
  return {
    type: 'Feature',
    properties: {fill: fill},
    geometry: {
      type: 'Polygon',
      coordinates: [coords]
    }
  };
}
