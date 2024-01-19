import { getMapFrameMetersPerPixel, findFrameDataset } from '../furniture/mapshaper-frame-data';
import { addFurnitureLayer } from '../furniture/mapshaper-furniture-cmd';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
import { stop, message } from '../utils/mapshaper-logging';
import { symbolRenderers } from '../svg/svg-symbols';

cmd.scalebar = function(catalog, opts) {
  var lyr = getScalebarLayer(opts);
  if (opts.label && !parseScalebarUnits(opts.label)) {
    stop(`Expected units of km or miles in scalebar label (received ${opts.label})`);
  }
  addFurnitureLayer(lyr, catalog);
};

export function getScalebarLayer(opts) {
  var obj = utils.defaults({type: 'scalebar'}, opts);
  return {
    name: opts.name || 'scalebar',
    data: new DataTable([obj])
  };
}

// TODO: generalize to other kinds of furniture as they are developed
function getScalebarPosition(d) {
  var opts = { // defaults
    valign: 'top',
    halign: 'left',
    voffs: 10,
    hoffs: 10
  };
  if (+d.left > 0) {
    opts.hoffs = +d.left;
  }
  if (+d.top > 0) {
    opts.voffs = +d.top;
  }
  if (+d.right > 0) {
    opts.hoffs = +d.right;
    opts.halign = 'right';
  }
  if (+d.bottom > 0) {
    opts.voffs = +d.bottom;
    opts.valign = 'bottom';
  }
  return opts;
}

export function renderScalebar(d, frame) {
  var pos = getScalebarPosition(d);
  var metersPerPx = getMapFrameMetersPerPixel(frame);
  var frameWidthPx = frame.width;
  var unit = d.label ? parseScalebarUnits(d.label) : 'mile';
  var number = d.label ? parseScalebarNumber(d.label) : null;
  var label = number && unit ? d.label : getAutoScalebarLabel(frameWidthPx, metersPerPx, unit);
  var scalebarKm = parseScalebarLabelToKm(label);
  var barHeight = 3;
  var labelOffs = 4;
  var fontSize = +d.font_size || 12;
  var width = Math.round(scalebarKm / metersPerPx * 1000);
  var height = Math.round(barHeight + labelOffs + fontSize * 0.8);
  var labelPos = d.label_position == 'top' ? 'top' : 'bottom';
  var anchorX = pos.halign == 'left' ? 0 : width;
  var anchorY = barHeight + labelOffs;
  var dx = pos.halign == 'right' ? frameWidthPx - width - pos.hoffs : pos.hoffs;
  var dy = pos.valign == 'bottom' ? frame.height - height - pos.voffs : pos.voffs;

  if (scalebarKm > 0 === false) {
    message('Unusable scalebar label:', label);
    return [];
  }

  if (frameWidthPx > 0 === false) {
    return [];
  }

  if (!frame.crs) {
    message('Unable to render scalebar: unknown CRS.');
    return [];
  }

  if (labelPos == 'top') {
    anchorY = -labelOffs;
    dy += Math.round(labelOffs + fontSize * 0.8);
  }

  if (width > 0 === false) {
    stop("Null scalebar length");
  }
  var barObj = {
    tag: 'rect',
    properties: {
      fill: 'black',
      x: 0,
      y: 0,
      width: width,
      height: barHeight
    }
  };
  var labelOpts = {
      'label-text': label,
      'font-size': fontSize,
      'text-anchor': pos.halign == 'left' ? 'start': 'end',
      'dominant-baseline': labelPos == 'top' ? 'auto' : 'hanging'
      //// 'dominant-baseline': labelPos == 'top' ? 'text-after-edge' : 'text-before-edge'
      // 'text-after-edge' is buggy in Safari and unsupported by Illustrator,
      // so I'm using 'hanging' and 'auto', which seem to be well supported.
      // downside: requires a kludgy multiplier to calculate scalebar height (see above)
    };
  var labelObj = symbolRenderers.label(labelOpts, anchorX, anchorY);
  var g = {
    tag: 'g',
    children: [barObj, labelObj],
    properties: {
      transform: 'translate(' + dx + ' ' + dy + ')'
    }
  };
  return [g];
}

// unit: 'km' || 'mile'
function getAutoScalebarLabel(mapWidth, metersPerPx, unit) {
  var minWidth = 70; // 100; // TODO: vary min size based on map width
  var minKm = metersPerPx * minWidth / 1000;
  // note: removed 1.5 12 and 1,200
  var options = ('1/8 1/5 1/4 1/2 1 2 3 4 5 8 10 15 20 25 30 40 50 75 ' +
    '100 150 200 250 300 350 400 500 750 1,000 1,500 2,000 ' +
    '2,500 3,000 4,000 5,000').split(' ');
  return options.reduce(function(memo, str) {
    if (memo) return memo;
    var label = formatDistanceLabel(str, unit);
    if (parseScalebarLabelToKm(label) > minKm) {
       return label;
    }
  }, null) || '';
}

export function formatDistanceLabel(numStr, unit) {
  var num = parseScalebarNumber(numStr);
  var unitStr = unit == 'km' && 'KM' || num > 1 && 'MILES' || 'MILE';
  return numStr + ' ' + unitStr;
}

// See test/mapshaper-scalebar.js for examples of supported formats
export function parseScalebarLabelToKm(str) {
  var units = parseScalebarUnits(str);
  var value = parseScalebarNumber(str);
  if (!units || !value) return NaN;
  return units == 'mile' ? value * 1.60934 : value;
}

function parseScalebarUnits(str) {
  var isMiles = /miles?$/.test(str.toLowerCase());
  var isKm = /(k\.m\.|km|kilometers?|kilometres?)$/.test(str.toLowerCase());
  var units = isMiles && 'mile' || isKm && 'km' || '';
  return units;
}

function parseScalebarNumber(str) {
  var fractionRxp = /^([0-9]+) ?\/ ?([0-9]+)/;
  var match, value;
  str = str.replace(/[\s]/g, '').replace(/,/g, '');
  if (fractionRxp.test(str)) {
    match = fractionRxp.exec(str);
    value = +match[1] / +match[2];
  } else {
    value = parseFloat(str);
  }
  return value > 0 && value < Infinity ? value : NaN;
}
