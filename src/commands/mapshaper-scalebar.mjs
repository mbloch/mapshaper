import { getMapFrameMetersPerPixel } from '../furniture/mapshaper-frame-utils';
import { resolveFrameForDataset } from '../furniture/mapshaper-frame-resolver';
import { addFurnitureLayer, setFrameFurnitureLayer } from '../furniture/mapshaper-furniture-cmd';
import cmd from '../mapshaper-cmd';
import { DataTable } from '../datatable/mapshaper-data-table';
import { stop, message } from '../utils/mapshaper-logging';
import { symbolRenderers } from '../svg/svg-symbols';
import { importMultiLineString, importPolygon } from '../svg/svg-geom-primitives';
import { getMeasuredTextWidth } from '../svg/svg-label-metrics';

// Command options that are stored in the scalebar's data record
var scalebarFields = ['label', 'units', 'style', 'font_size', 'font_family',
  'font_style', 'font_weight', 'color', 'tic_length', 'bar_width', 'label_offset',
  'position', 'label_position', 'dual_units', 'align', 'label_case', 'margin'];

// With a map frame, the scalebar belongs to the frame, and running the
// command again replaces it. Without a frame, each run adds a standalone
// scalebar layer, which is exported if it is included in the output layers.
// @targetDataset (optional) the frame is the one this dataset belongs to
cmd.scalebar = function(catalog, targetDataset, opts) {
  var frame = resolveFrameForDataset(catalog, targetDataset || null);
  if (opts.remove) {
    if (!frame || !setFrameFurnitureLayer(frame.dataset, 'scalebar', null)) {
      stop('The map frame has no scalebar to remove');
    }
    return;
  }
  validateScalebarOpts(opts);
  var lyr = getScalebarLayer(opts);
  if (frame) {
    setFrameFurnitureLayer(frame.dataset, 'scalebar', lyr);
  } else {
    addFurnitureLayer(lyr, catalog);
  }
};

export function getScalebarLayer(opts) {
  var rec = {type: 'scalebar'};
  scalebarFields.forEach(function(k) {
    if (opts[k] !== undefined && opts[k] !== null && opts[k] !== '') {
      rec[k] = opts[k];
    }
  });
  return {
    name: 'scalebar',
    data: new DataTable([rec])
  };
}

function validateScalebarOpts(opts) {
  if (opts.label) {
    splitScalebarLabel(opts.label).forEach(function(str) {
      if (!parseScalebarUnits(str) && !isBareDistance(str)) {
        stop(`Expected a distance or units of km, meters, miles or feet in scalebar label (received ${str})`);
      }
    });
  }
  if (opts.units && !parseLabelUnits(opts.units)) {
    stop('Unsupported scalebar units:', opts.units);
  }
  if (opts.style && !/^[abc]$/i.test(opts.style)) {
    stop('Unsupported scalebar style:', opts.style);
  }
  if (opts.align && !/^(left|center|right)$/.test(opts.align)) {
    stop('Unsupported scalebar alignment:', opts.align);
  }
  if (opts.label_case && !/^(upper|lower)$/.test(opts.label_case)) {
    stop('Unsupported scalebar label case:', opts.label_case);
  }
}

// Returns 'upper', 'lower' or ''. Without the label-case option, a label
// written in lower case gives lower case to the distances that are generated
// for it (a second distance, a stepped length); otherwise labels are drawn as
// written, and generated distances are in upper case.
export function getScalebarLabelCase(d) {
  var letters;
  if (d.label_case == 'upper' || d.label_case == 'lower') return d.label_case;
  letters = String(d.label || '').replace(/[^a-z]/gi, '');
  return letters && letters == letters.toLowerCase() ? 'lower' : '';
}

function applyLabelCase(text, labelCase) {
  if (!text) return text;
  return labelCase == 'lower' ? text.toLowerCase() :
    labelCase == 'upper' ? text.toUpperCase() : text;
}

// Returns 'a', 'b' or 'c'. A dual-unit scalebar with no style is style b.
export function getScalebarStyle(d) {
  var style = String(d && d.style || '').toLowerCase();
  if (style == 'b' || style == 'c') return style;
  return !style && d && d.dual_units ? 'b' : 'a';
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
  if (metersPerPx > 0 === false) {
    message(`Unable to render scalebar: ${getScalebarScaleProblem(frame)}.`);
    return [];
  }
  if (opts.style == 'c') {
    return renderSegmentedScalebar(d, frame, metersPerPx, opts);
  }
  var frameWidthPx = frame.width;
  var labels = d.label ? splitScalebarLabel(d.label) : [];
  var units = parseLabelUnits(d.units) || 'mile';
  var label1 = getScalebarLabel(labels[0], frameWidthPx, metersPerPx, units);
  var props1 = parseScalebarLabel(label1);
  var label2 = null;
  var props2, length2;

  if (props1.km > 0 === false) {
    message('Unusable scalebar label:', labels[0] || '');
    return [];
  }

  var length1 = Math.round(props1.km / metersPerPx * 1000);
  if (length1 > 0 === false) {
    // A valid distance can be less than half a pixel at the current map
    // scale. There is no bar to draw, but this is not an error: resizing the
    // frame or stepping to a longer distance can make it visible again.
    return [];
  }

  if (labels[1]) {
    label2 = completeLabel(labels[1], getOtherUnits(props1.units));
  } else if (opts.dual_units) {
    label2 = getAutoSecondLabel(length1, metersPerPx, getOtherUnits(props1.units));
  }
  if (label2) {
    props2 = parseScalebarLabel(label2);
    length2 = Math.round(props2.km / metersPerPx * 1000);
    if (length2 > length1) {
      stop("First part of a dual-unit scalebar must be longer than the second part.");
    }
  }

  var barPos = getScalebarPosition(opts);
  var labelPos = getLabelPosition(opts);
  var dx = barPos.xpos == 'right' ? frameWidthPx - length1 - opts.margin :
    barPos.xpos == 'center' ? (frameWidthPx - length1) / 2 : opts.margin;
  var dy = barPos.ypos == 'bottom' ? frame.height - opts.margin : opts.margin;

  // vshift to adjust for height above or below the baseline
  var labelHeight = Math.round(opts.label_offset + opts.tic_length + opts.font_size * 0.8 + opts.bar_width / 2);
  var bareHeight = Math.round(opts.bar_width / 2);
  var topHeight = labelPos.ypos == 'top' || label2 ? labelHeight : bareHeight;
  var bottomHeight = labelPos.ypos == 'bottom' || label2 ? labelHeight : bareHeight;
  if (label2) bottomHeight += getSecondBarY(opts);
  if (barPos.ypos == 'top') {
    dy += topHeight;
  } else {
    dy -= bottomHeight;
  }

  var labelCase = getScalebarLabelCase(d);
  var g = renderAsSvg(length1, applyLabelCase(label1, labelCase), length2,
    applyLabelCase(label2, labelCase), opts);
  g.properties = {
    transform: 'translate(' + dx + ' ' + dy + ')'
  };

  return [g];
}

// Returns a reason why a scalebar can't be sized in a projected frame, or null.
// The GUI checks this before drawing, so that a redraw doesn't repeat the
// message renderScalebar() prints.
export function getScalebarScaleProblem(frame) {
  return getMapFrameMetersPerPixel(frame) > 0 ? null :
    'the map scale could not be calculated at the center of the map';
}

var styleOpts = {
  a: {
    bar_width: 3,
    tic_length: 0
  },
  b: {
    bar_width: 1,
    tic_length: 5
  },
  c: {
    bar_width: 4, // height of the bar
    tic_length: 0,
    align: 'center'
  }
};

var defaultOpts = {
  position: 'top-left',
  label_position: 'top',
  label_offset: 4,
  font_size: 12,
  margin: 12
};

// The settings a scalebar is drawn with: its own, and the defaults of its
// style for the rest
export function getScalebarOpts(d) {
  var style = getScalebarStyle(d);
  var opts = Object.assign({}, defaultOpts, styleOpts[style]);
  Object.keys(d).forEach(function(k) {
    if (d[k] !== undefined && d[k] !== null && d[k] !== '') opts[k] = d[k];
  });
  opts.style = style;
  return opts;
}

// With dual units, style b has one bar with a distance on each side, and
// style a has a second bar below the first, each with its label on the
// outside. The labels of style a keep their horizontal position.
function renderAsSvg(length, text, length2, text2, opts) {
  if (opts.style == 'a' && text2) {
    return {
      tag: 'g',
      children: [
        renderLabel(text, length, Object.assign({}, opts, {ypos: 'top'})),
        renderBar(length, length2, opts),
        renderLabel(text2, length2, Object.assign({}, opts,
          {ypos: 'bottom', dy: getSecondBarY(opts)}))
      ]
    };
  }
  var labelPart = renderLabel(text, length, opts);
  var barPart = renderBar(length, length2, opts);
  var parts = [labelPart, barPart];
  if (opts.style == 'b' && labelsHaveRoomForZero(text, length, opts)) {
    parts.unshift(renderLabel('0', length, Object.assign({flipx: true}, opts)));
  }
  if (text2) {
    parts.push(renderLabel(text2, length2, Object.assign({flipy: true}, opts)));
    if (labelsHaveRoomForZero(text2, length2, opts)) {
      parts.push(renderLabel('0', length2, Object.assign({flipx: true, flipy: true}, opts)));
    }
  }
  return {
    tag: 'g',
    children: parts
  };
}

// In style b, the zero starts just left of x=0 and the distance ends just
// right of x=length. Drop the zero if their measured text boxes overlap or
// come within a quarter of the font size. If metrics are unavailable, retain
// the zero as before.
function labelsHaveRoomForZero(text, length, opts) {
  var zeroWidth = getScalebarTextWidth('0', opts);
  var textWidth = getScalebarTextWidth(text, opts);
  var gap = length + opts.font_size / 2 - zeroWidth - textWidth;
  return !zeroWidth || !textWidth || gap >= Math.max(2, opts.font_size / 4);
}

function getScalebarTextWidth(text, opts) {
  var rec = {
    'label-text': text,
    'font-size': opts.font_size
  };
  ['font_family', 'font_style', 'font_weight'].forEach(function(k) {
    if (opts[k]) rec[k.replace('_', '-')] = opts[k];
  });
  return getMeasuredTextWidth(rec);
}

function getScalebarPosition(opts) {
  var pos = opts.position || 'top-left';
  return {
    ypos: pos.includes('bottom') ? 'bottom' : 'top',
    xpos: pos.includes('center') ? 'center' :
      pos.includes('right') ? 'right' : 'left'
  };
}

function renderLabel(text, length, opts) {
  var labelPos = getLabelPosition(opts);
  var anchorX = length * labelPos.kx + labelPos.dx;
  var bottomLabelY = opts.bar_width + opts.tic_length + opts.label_offset;
  var topLabelY = -opts.label_offset - opts.tic_length;
  var anchorY = (labelPos.ypos == 'top' ? topLabelY : bottomLabelY) + (opts.dy || 0);
  return makeTextLabel(text, anchorX, anchorY, labelPos.anchor, labelPos.ypos, opts);
}

// @anchor SVG text-anchor value
// @side 'top': the text sits above @y; 'bottom': it hangs below @y
function makeTextLabel(text, x, y, anchor, side, opts) {
  var labelOpts = {
      'label-text': text,
      'font-size': opts.font_size,
      'text-anchor': anchor,
      'dominant-baseline': side == 'top' ? 'auto' : 'hanging',
      //// 'dominant-baseline': labelPos == 'top' ? 'text-after-edge' : 'text-before-edge'
      // 'text-after-edge' is buggy in Safari and unsupported by Illustrator,
      // so I'm using 'hanging' and 'auto', which seem to be well supported.
      // downside: requires a kludgy multiplier to calculate scalebar height (see above)
    };
  if (opts.color) labelOpts.fill = opts.color;
  if (opts.font_family) labelOpts['font-family'] = opts.font_family;
  if (opts.font_style) labelOpts['font-style'] = opts.font_style;
  if (opts.font_weight) labelOpts['font-weight'] = opts.font_weight;
  return symbolRenderers.label(labelOpts, x, y);
}

function getLabelPosition(opts) {
  var pos = opts.label_position;
  var ypos = opts.ypos || pos.includes('bottom') && 'bottom' || 'top';
  var dx = 0;
  var xpos;
  if (opts.style == 'a') {
    xpos = pos.includes('center') && 'center' || pos.includes('right') && 'right' || 'left';
  } else {
    xpos = 'right'; // style b
  }
  if (opts.flipx) {
    xpos = xpos == 'left' && 'right' || xpos == 'right' && 'left' || xpos;
  }
  if (opts.flipy) {
    ypos = ypos == 'top' && 'bottom' || ypos == 'bottom' && 'top' || ypos;
  }
  if (opts.style == 'b') {
    dx = xpos == 'left' && -opts.font_size / 4 || xpos == 'right' && opts.font_size / 4 || 0;
  }
  return {
    xpos,
    ypos,
    dx,
    kx: xpos == 'right' && 1 || xpos == 'center' && 0.5 || 0,
    anchor: xpos == 'center' && 'middle' || xpos == 'left' && 'start' || 'end'
  };
}

// length1: length of main bar
// length2: length of optional second distance (assumes that length2 <= length1)
function getStyleBCoords(length1, length2, opts) {
  var coords = [];
  var labelPos = getLabelPosition(opts);
  var y = opts.tic_length + opts.bar_width / 2;
  if (labelPos.ypos == "top") {
    y = -y;
  }
  coords.push([[0, y], [0, 0], [length1, 0], [length1, y]]);
  if (length2 > 0) {
    coords.push([[0, 0], [0, -y]]);
    coords.push([[length2, 0], [length2, -y]]);
  }
  return coords;
}

// The offset of the second bar of a dual-unit style a scalebar, which is
// separated from the first by the width of a bar
function getSecondBarY(opts) {
  return opts.style == 'a' ? opts.bar_width * 2 : 0;
}

// length: length of scale bar in px
// length2: length of optional dual-units portion of the scalebar
function renderBar(length, length2, opts) {
  var coords;
  if (opts.style == 'b') {
    coords = getStyleBCoords(length, length2, opts);
  } else {
    coords = [[[0, 0], [length, 0]]];
    if (length2 > 0) coords.push([[0, getSecondBarY(opts)], [length2, getSecondBarY(opts)]]);
  }
  var bar = importMultiLineString(coords);
  Object.assign(bar.properties, {
    stroke: opts.color || 'black',
    fill: 'none',
    'stroke-width': opts.bar_width,
    'stroke-linecap': 'butt',
    'stroke-linejoin': 'miter'
  });
  return bar;
}

// Kilometers per unit
var unitSizes = {
  km: 1,
  m: 0.001,
  mile: 1.60934,
  ft: 0.0003048
};

// Candidate lengths for automatic labels, in ascending order of distance
var integers = '1 2 3 4 5 8 10 15 20 25 30 40 50 75 100 150 200 250 300 350' +
  ' 400 500 750 1,000 1,500 2,000 2,500 3,000 4,000 5,000 7,500 10,000';
var autoLengths = {
  imperial: [
    ['ft', '10 20 25 50 100 200 250 500'],
    // note: removed 1.5 12 and 1,200
    ['mile', '1/8 1/5 1/4 1/2 ' + integers]
  ],
  metric: [
    ['m', '5 10 20 25 50 100 200 250 500'],
    ['km', integers]
  ]
};

function getAutoLabels(system) {
  return autoLengths[system].reduce(function(memo, group) {
    return memo.concat(group[1].split(' ').map(function(str) {
      return formatDistanceLabel(str, group[0]);
    }));
  }, []);
}

function getUnitSystem(units) {
  return units == 'km' || units == 'm' ? 'metric' : 'imperial';
}

function getOtherUnits(units) {
  return getUnitSystem(units) == 'metric' ? 'mile' : 'km';
}

// The unit system of the units= option: returns 'km', 'mile' or ''
export function parseUnitsOption(str) {
  var units = parseLabelUnits(str);
  return units ? (getUnitSystem(units) == 'metric' ? 'km' : 'mile') : '';
}

// Accepts the units= option, which also gives the units of a label that is a
// bare number; returns 'km', 'm', 'mile', 'ft' or ''
export function parseLabelUnits(str) {
  var s = String(str || '').toLowerCase();
  if (/^(km|kilomet(er|re)s?|metric)$/.test(s)) return 'km';
  if (/^(m|meters?|metres?)$/.test(s)) return 'm';
  if (/^(mi|miles?|imperial)$/.test(s)) return 'mile';
  if (/^(ft|feet)$/.test(s)) return 'ft';
  return '';
}

// Splits a dual-unit label like "100 km,50 miles". Only a comma after the units
// separates two distances, so "1,000 km" and a bare "1,500" stay whole.
export function splitScalebarLabel(label) {
  return String(label).split(/(?<=[^\d\s]),\s*/).map(function(str) {
    return str.trim();
  }).filter(Boolean);
}

// A distance with no units, e.g. "150" or "1/2" or "1,000"
function isBareDistance(str) {
  return /^[\d\s.,/]+$/.test(str) && parseScalebarNumber(str) > 0;
}

// Adds units to a label that is a bare number
function completeLabel(label, units) {
  return isBareDistance(label) ? formatDistanceLabel(label.trim(), units) : label;
}

// label: a label from the label= option, or empty for an automatic label
function getScalebarLabel(label, frameWidthPx, metersPerPx, defaultUnits) {
  var units;
  if (label && parseScalebarNumber(label) > 0) return completeLabel(label, defaultUnits);
  // A label with units but no number gets an automatic length in those units
  units = label && parseScalebarUnits(label) || defaultUnits;
  return getAutoScalebarLabel(frameWidthPx, metersPerPx, units);
}

// unit: 'km' || 'mile' (or 'm', 'ft' for the same systems)
// The longest length that fits within 20% of the map's width, or the shortest
// that is at least 70px long if the map is too narrow for that
function getAutoScalebarLabel(mapWidth, metersPerPx, unit) {
  return pickAutoLabel(getAutoLabels(getUnitSystem(unit)), mapWidth, metersPerPx);
}

// @labels candidate labels, in ascending order of the length of their
// longest distance
function pickAutoLabel(labels, mapWidth, metersPerPx) {
  var minKm = metersPerPx * 70 / 1000;
  var maxKm = metersPerPx * mapWidth * 0.2 / 1000;
  var longest = labels.filter(function(label) {
    var km = getLongestKm(label);
    return km >= minKm && km <= maxKm;
  }).pop();
  return longest || labels.find(function(label) {
    return getLongestKm(label) >= minKm;
  }) || '';
}

// The longest of the distances in a single or dual-unit label, in km
function getLongestKm(label) {
  return Math.max.apply(null, splitScalebarLabel(label).map(parseScalebarLabelToKm));
}

// The label of a scalebar whose length is stepped to the next longer
// (@direction > 0) or shorter of the automatic lengths, from the length it
// has now, whether that was given or automatic. A second distance is kept if
// it is still the shorter one. Returns null if there is no next length, or
// if the current length is automatic and @frame can't give the map scale.
// @d scalebar data record
// @frame frame data, as passed to renderScalebar()
export function getSteppedScalebarLabel(d, frame, direction) {
  var label = getScalebarStyle(d) == 'c' ?
    getSteppedSegmentedLabel(d, frame, direction) :
    getSteppedLabel(d, frame, direction);
  return applyLabelCase(label, getScalebarLabelCase(d));
}

function getSteppedLabel(d, frame, direction) {
  var labels = d.label ? splitScalebarLabel(d.label) : [];
  var units = parseLabelUnits(d.units) || 'mile';
  var label1 = getCurrentScalebarLabel(labels[0], frame, units);
  var km = label1 ? parseScalebarLabelToKm(label1) : NaN;
  var candidates, next, nextKm, label2;
  if (km > 0 === false) return null;
  candidates = getAutoLabels(getUnitSystem(parseScalebarUnits(label1)));
  if (direction < 0) candidates.reverse();
  next = candidates.find(function(label) {
    var km2 = parseScalebarLabelToKm(label);
    return direction > 0 ? km2 > km * (1 + 1e-9) : km2 < km * (1 - 1e-9);
  });
  if (!next) return null;
  nextKm = parseScalebarLabelToKm(next);
  label2 = labels[1] ? completeLabel(labels[1], getOtherUnits(parseScalebarUnits(next))) : null;
  if (label2 && parseScalebarLabelToKm(label2) < nextKm) {
    return next + ',' + labels[1];
  }
  return next;
}

function getCurrentScalebarLabel(label, frame, units) {
  var metersPerPx;
  if (label && parseScalebarNumber(label) > 0) return completeLabel(label, units);
  if (!frame || !frame.crs || frame.width > 0 === false) return null;
  metersPerPx = getMapFrameMetersPerPixel(frame);
  if (metersPerPx > 0 === false) return null;
  return getScalebarLabel(label, frame.width, metersPerPx, units);
}

// The longest automatic length in the given units that fits within the
// first part of a dual-unit scalebar
function getAutoSecondLabel(maxPx, metersPerPx, unit) {
  var maxKm = maxPx * metersPerPx / 1000;
  var minKm = maxKm / 4;
  var labels = getAutoLabels(getUnitSystem(unit)).filter(function(label) {
    var km = parseScalebarLabelToKm(label);
    return km <= maxKm && km >= minKm;
  });
  return labels.pop() || null;
}

// Style c: a bar of segments with alternating fill, a whole number of
// intervals long, labeled at each division. A single bar has two segments.
// A dual-unit scalebar is a metric bar of four or two segments above an
// imperial bar of two, both with the same interval number (e.g. 4 x 100 km
// over 2 x 100 miles); a pair of distances in other proportions gets two
// segments in each bar, each with its own interval.

// A mile is about 1.61 km, so each dual-unit interval i gives two scalebars:
// 2 x i miles (about 3.2i km) over 2 x i km, and 4 x i km over 2 x i miles.
// Their lengths alternate without ties only if each interval is more than
// 1.25 times the one before (4 x 20 km and 2 x 25 miles are about equal).
var segmentIntervals = '0.01 0.02 0.05 0.1 0.2 0.5 1 2 5 10 25 50 100 250 500' +
  ' 1,000 2,500 5,000';

// Candidate labels for automatic lengths and stepping, in ascending order of
// the longest bar. A single bar has the units of @units.
function getSegmentedCandidates(dual, units) {
  var imperial = getUnitSystem(units) == 'imperial';
  return segmentIntervals.split(' ').reduce(function(memo, str) {
    var i = parseScalebarNumber(str);
    var two = formatSegmentNumber(2 * i);
    if (!dual) {
      memo.push(formatDistanceLabel(two, imperial ? 'mile' : 'km'));
    } else {
      memo.push(formatDistanceLabel(two, 'mile') + ',' + formatDistanceLabel(two, 'km'));
      memo.push(formatDistanceLabel(formatSegmentNumber(4 * i), 'km') + ',' +
        formatDistanceLabel(two, 'mile'));
    }
    return memo;
  }, []);
}

// Returns the distances of a style c scalebar: one label, or two for a
// dual-unit scalebar. An automatic length needs @metersPerPx; without it,
// returns null.
function getSegmentedLabels(d, frameWidthPx, metersPerPx) {
  var units = parseLabelUnits(d.units) || 'mile';
  var labels = d.label ? splitScalebarLabel(d.label) : [];
  var dual = !!d.dual_units || labels.length > 1;
  var label1 = labels[0];
  var auto;
  if (label1 && parseScalebarNumber(label1) > 0) {
    label1 = completeLabel(label1, units);
    if (labels[1]) {
      return [label1, completeLabel(labels[1], getOtherUnits(parseScalebarUnits(label1)))];
    }
    return dual ? [label1, getSegmentedPartnerLabel(label1)] : [label1];
  }
  if (metersPerPx > 0 === false) return null;
  units = label1 && parseScalebarUnits(label1) || units;
  auto = pickAutoLabel(getSegmentedCandidates(dual, units), frameWidthPx, metersPerPx);
  return auto ? splitScalebarLabel(auto) : null;
}

// The other distance of a dual-unit scalebar given only one, with the given
// one as the longer bar: 400 km gets 200 miles (4 x 100 km over 2 x 100
// miles), and 50 miles gets 50 km (2 x 25 miles under 2 x 25 km).
function getSegmentedPartnerLabel(label) {
  var num = parseScalebarNumber(label);
  var units = parseScalebarUnits(label);
  if (getUnitSystem(units) == 'metric') {
    return formatDistanceLabel(formatSegmentNumber(num / 2), units == 'm' ? 'ft' : 'mile');
  }
  return formatDistanceLabel(formatSegmentNumber(num), units == 'ft' ? 'm' : 'km');
}

// Returns bars from top to bottom, or null if a label is unusable
function getSegmentedBars(labels) {
  var bars = labels.map(parseSegmentedBarLabel);
  if (bars.some(function(bar) { return !bar; })) return null;
  if (bars.length == 2) {
    if (getUnitSystem(bars[0].units) != 'metric' && getUnitSystem(bars[1].units) == 'metric') {
      bars.reverse();
    }
    if (Math.abs(bars[0].number - 2 * bars[1].number) <= bars[0].number * 1e-9) {
      bars[0].segments = 4;
    }
  }
  return bars;
}

function parseSegmentedBarLabel(label) {
  var match = /^([\d\s.,/]*\d)\s*(.*)$/.exec(label.trim());
  var units = parseScalebarUnits(label);
  var number = parseScalebarNumber(label);
  if (!match || !units || number > 0 === false) return null;
  return {
    numberText: match[1].trim(),
    unitsText: match[2].trim(),
    number: number,
    km: number * unitSizes[units],
    units: units,
    segments: 2
  };
}

function formatSegmentNumber(n) {
  var str = String(+n.toPrecision(12));
  return /^\d{4,}$/.test(str) ? str.replace(/\B(?=(\d{3})+$)/g, ',') : str;
}

function getSteppedSegmentedLabel(d, frame, direction) {
  var metersPerPx = frame && frame.crs && frame.width > 0 ?
    getMapFrameMetersPerPixel(frame) : NaN;
  var labels = getSegmentedLabels(d, frame ? frame.width : 0, metersPerPx);
  var km = labels ? getLongestKm(labels.join(',')) : NaN;
  var candidates;
  if (km > 0 === false) return null;
  candidates = getSegmentedCandidates(labels.length > 1, parseScalebarUnits(labels[0]));
  if (direction < 0) candidates.reverse();
  return candidates.find(function(label) {
    var km2 = getLongestKm(label);
    return direction > 0 ? km2 > km * (1 + 1e-9) : km2 < km * (1 - 1e-9);
  }) || null;
}

function renderSegmentedScalebar(d, frame, metersPerPx, opts) {
  var labels = getSegmentedLabels(d, frame.width, metersPerPx);
  var bars = labels ? getSegmentedBars(labels) : null;
  var children = [];
  var layout;
  if (!bars) {
    message('Unusable scalebar label:', d.label || '');
    return [];
  }
  bars.forEach(function(bar) {
    bar.length = Math.round(bar.km / metersPerPx * 1000);
    bar.unitsText = applyLabelCase(bar.unitsText, getScalebarLabelCase(d));
  });
  if (bars.some(function(bar) { return bar.length > 0 === false; })) {
    return []; // too short to draw at this scale; see renderScalebar()
  }
  layout = layoutSegmentedBars(bars, opts);
  bars.forEach(function(bar) {
    children.push.apply(children, renderSegmentedBar(bar, opts));
  });
  layout.labels.forEach(function(o) {
    children.push(makeTextLabel(o.text, o.x, o.y, o.anchor, o.side, opts));
  });
  return [{
    tag: 'g',
    children: children,
    properties: {
      transform: 'translate(' + getSegmentedOffset(layout, frame, opts).join(' ') + ')'
    }
  }];
}

// Sets the position of each bar, and returns the labels that fit and the
// extent of the scalebar, relative to the left end of the longest bar
function layoutSegmentedBars(bars, opts) {
  var h = opts.bar_width;
  var maxLength = Math.max.apply(null, bars.map(function(bar) { return bar.length; }));
  var labels = [];
  var bbox = [0, Infinity, maxLength, -Infinity];
  bars.forEach(function(bar, i) {
    var space = maxLength - bar.length;
    bar.x = opts.align == 'left' ? 0 : opts.align == 'right' ? space : Math.round(space / 2);
    if (bars.length == 1) {
      bar.y = -h / 2;
      bar.side = getLabelPosition(opts).ypos;
    } else {
      bar.y = i === 0 ? -h - h / 2 : h / 2; // the gap between bars is one bar high
      bar.side = i === 0 ? 'top' : 'bottom';
    }
    getSegmentedBarLabels(bar, opts).forEach(function(o) {
      labels.push(o);
      bbox[0] = Math.min(bbox[0], o.left);
      bbox[2] = Math.max(bbox[2], o.right);
    });
    bbox[1] = Math.min(bbox[1], bar.side == 'top' ?
      bar.y - opts.label_offset - opts.font_size * 0.8 : bar.y);
    bbox[3] = Math.max(bbox[3], bar.side == 'bottom' ?
      bar.y + h + opts.label_offset + opts.font_size * 0.8 : bar.y + h);
  });
  return {labels: labels, bbox: bbox, length: maxLength};
}

// Labels centered on each division, numbers only except the last, which has
// the units. Labels that crowd each other are dropped, keeping every other
// one, then the ends, then only the last.
function getSegmentedBarLabels(bar, opts) {
  var n = bar.segments;
  var interval = bar.number / n;
  var minGap = Math.max(2, opts.font_size / 4);
  var y = bar.side == 'top' ? bar.y - opts.label_offset :
    bar.y + opts.bar_width + opts.label_offset;
  var measured = true;
  var labels = [];
  var choices, ids;
  for (var k = 0; k <= n; k++) {
    labels.push(getDivisionLabel(k, n));
  }
  choices = [labels.map(function(o, k) { return k; })];
  if (n == 4) choices.push([0, 2, 4]);
  choices.push([0, n], [n]);
  ids = measured ? choices.find(labelsFit) : choices[0];
  return ids.map(function(k) { return labels[k]; });

  function getDivisionLabel(k, n) {
    var x = bar.x + bar.length * k / n;
    var text = k == n ? bar.numberText + ' ' + bar.unitsText :
      formatSegmentNumber(interval * k);
    var width = getSegmentTextWidth(text, opts);
    if (!getScalebarTextWidth(text, opts)) measured = false;
    return {
      text: text,
      x: x,
      y: y,
      anchor: 'middle',
      side: bar.side,
      left: x - width / 2,
      right: x + width / 2
    };
  }

  function labelsFit(ids) {
    return ids.every(function(k, j) {
      return j === 0 || labels[k].left - labels[ids[j - 1]].right >= minGap;
    });
  }
}

// Text width for layout; an estimate if there is nothing to measure with
function getSegmentTextWidth(text, opts) {
  return getScalebarTextWidth(text, opts) || text.length * opts.font_size * 0.55;
}

function renderSegmentedBar(bar, opts) {
  var color = opts.color || 'black';
  var y1 = bar.y, y2 = bar.y + opts.bar_width;
  var filled = [];
  var box = importPolygon([getRectRing(bar.x, y1, bar.x + bar.length, y2)]);
  var x1, x2;
  Object.assign(box.properties, {
    fill: 'white',
    stroke: color,
    'stroke-width': 1,
    'stroke-linejoin': 'miter'
  });
  for (var k = 0; k < bar.segments; k += 2) {
    x1 = bar.x + bar.length * k / bar.segments;
    x2 = bar.x + bar.length * (k + 1) / bar.segments;
    filled.push(getRectRing(x1, y1, x2, y2));
  }
  var segments = importPolygon(filled);
  segments.properties.fill = color;
  return [box, segments];
}

function getRectRing(x1, y1, x2, y2) {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
}

// Places the bars, rather than the labels, in the center of the frame
function getSegmentedOffset(layout, frame, opts) {
  var pos = getScalebarPosition(opts);
  var bbox = layout.bbox;
  var dx = pos.xpos == 'right' ? frame.width - opts.margin - bbox[2] :
    pos.xpos == 'center' ? (frame.width - layout.length) / 2 : opts.margin - bbox[0];
  var dy = pos.ypos == 'bottom' ? frame.height - opts.margin - bbox[3] :
    opts.margin - bbox[1];
  return [Math.round(dx), Math.round(dy)];
}

export function formatDistanceLabel(numStr, unit) {
  var num = parseScalebarNumber(numStr);
  var unitStr = unit == 'km' && 'KM' ||
    unit == 'm' && (num > 1 ? 'METERS' : 'METER') ||
    unit == 'ft' && (num > 1 ? 'FEET' : 'FOOT') ||
    num > 1 && 'MILES' || 'MILE';
  return numStr + ' ' + unitStr;
}

// See test/scalebar-test.mjs for examples of supported formats
export function parseScalebarLabelToKm(str) {
  var units = parseScalebarUnits(str);
  var value = parseScalebarNumber(str);
  if (!units || !value) return NaN;
  return value * unitSizes[units];
}

function parseScalebarLabel(label) {
  var num = label ? parseScalebarNumber(label) : null;
  var units = label ? parseScalebarUnits(label) : 'mile';
  var km = NaN;
  if (units && num) {
    km = num * unitSizes[units];
  }
  return {
    number: num,
    units: units,
    km: km
  };
}

// Returns 'km', 'm', 'mile', 'ft' or ''
export function parseScalebarUnits(str) {
  var s = String(str).trim().toLowerCase();
  if (/(miles?|mi[.]?|英里)$/.test(s)) return 'mile';
  if (/(k\.m\.|km|kilomet(er|re)s?|kilom.tres?|公里)$/.test(s)) return 'km';
  if (/(^|[\d\s.])(feet|foot|ft[.]?|英尺)$/.test(s)) return 'ft';
  if (/(^|[\d\s.])(m|m\.|meters?|metres?|mètres?|米)$/.test(s)) return 'm';
  return '';
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
