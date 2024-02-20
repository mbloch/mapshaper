import { getMapFrameMetersPerPixel, findFrameDataset } from '../furniture/mapshaper-frame-data';
import { addFurnitureLayer } from '../furniture/mapshaper-furniture-cmd';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
import { stop, message } from '../utils/mapshaper-logging';
import { symbolRenderers } from '../svg/svg-symbols';
import { importLineString } from '../svg/geojson-to-svg';

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
function getScalebarPosition(opts) {
  var pos = opts.position || 'top-left';
  return {
    valign: pos.includes('top') ? 'top' : 'bottom',
    halign: pos.includes('left') ? 'left' : 'right'
  };
}

var styleOpts = {
  a: {
    bar_width: 3,
    tic_length: 0
  },
  b: {
    bar_width: 1,
    tic_length: 5
  }
};

var defaultOpts = {
  position: 'top-left',
  label_position: 'top',
  label_offset: 4,
  font_size: 12,
  margin: 12
};

function getScalebarOpts(d) {
  var style = d.style == 'b' || d.style == 'B' ? 'b' : 'a';
  return Object.assign({}, defaultOpts, styleOpts[style], d, {style: style});
}

// approximate pixel height of the scalebar
function getScalebarHeight(opts) {
  return Math.round(opts.bar_width + opts.label_offset +
      opts.tic_length + opts.font_size * 0.8);
}

function renderAsSvg(length, text, opts) {
  // label part
  var xOff = opts.style == 'b' ? Math.round(opts.font_size / 4) : 0;
  var alignLeft = opts.style == 'a' && opts.position.includes('left');
  var anchorX = alignLeft ? -xOff : length + xOff;
  var anchorY = opts.bar_width + + opts.tic_length + opts.label_offset;
  if (opts.label_position == 'top') {
    anchorY = -opts.label_offset - opts.tic_length;
  }
  var labelOpts = {
      'label-text': text,
      'font-size': opts.font_size,
      'text-anchor': alignLeft ? 'start': 'end',
      'dominant-baseline': opts.label_position == 'top' ? 'auto' : 'hanging'
      //// 'dominant-baseline': labelPos == 'top' ? 'text-after-edge' : 'text-before-edge'
      // 'text-after-edge' is buggy in Safari and unsupported by Illustrator,
      // so I'm using 'hanging' and 'auto', which seem to be well supported.
      // downside: requires a kludgy multiplier to calculate scalebar height (see above)
    };
  var labelPart = symbolRenderers.label(labelOpts, anchorX, anchorY);
  var zeroOpts = Object.assign({}, labelOpts, {'label-text': '0', 'text-anchor': 'start'});
  var zeroLabel = symbolRenderers.label(zeroOpts, -xOff, anchorY);

  // bar part
  var y = 0;
  var y2 = opts.tic_length + opts.bar_width / 2;
  var coords;
  if (opts.label_position == "top") {
    y2 = -y2;
  }
  if (opts.tic_length > 0) {
    coords = [[0, y2], [0, y], [length, y], [length, y2]];
  } else {
    coords = [[0, y], [length, y]];
  }
  var barPart = importLineString(coords);
  Object.assign(barPart.properties, {
    stroke: 'black',
    fill: 'none',
    'stroke-width': opts.bar_width,
    'stroke-linecap': 'butt',
    'stroke-linejoin': 'miter'
  });
  var parts = opts.style == 'b' ? [zeroLabel, labelPart, barPart] : [labelPart, barPart];
  return {
    tag: 'g',
    children: parts
  };
}

export function renderScalebar(d, frame) {
  if (!frame.crs) {
    message('Unable to render scalebar: unknown CRS.');
    return [];
  }
  if (frame.width > 0 === false) {
    return [];
  }

  var opts = getScalebarOpts(d);
  var metersPerPx = getMapFrameMetersPerPixel(frame);
  var frameWidthPx = frame.width;
  var unit = d.label ? parseScalebarUnits(d.label) : 'mile';
  var number = d.label ? parseScalebarNumber(d.label) : null;
  var label = number && unit ? d.label : getAutoScalebarLabel(frameWidthPx, metersPerPx, unit);

  var scalebarKm = parseScalebarLabelToKm(label);
  if (scalebarKm > 0 === false) {
    message('Unusable scalebar label:', label);
    return [];
  }

  var width = Math.round(scalebarKm / metersPerPx * 1000);
  if (width > 0 === false) {
    stop("Null scalebar length");
  }

  var pos = getScalebarPosition(opts);
  var height = getScalebarHeight(opts);
  var dx = pos.halign == 'right' ? frameWidthPx - width - opts.margin : opts.margin;
  var dy = pos.valign == 'bottom' ? frame.height - height - opts.margin : opts.margin;
  if (opts.label_position == 'top') {
    dy += Math.round(opts.label_offset + opts.tic_length + opts.font_size * 0.8 + opts.bar_width / 2);
  } else {
    dy += Math.round(opts.bar_width / 2);
  }

  var g = renderAsSvg(width, label, opts);
  g.properties = {
    transform: 'translate(' + dx + ' ' + dy + ')'
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
