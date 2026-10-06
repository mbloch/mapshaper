import { El } from './gui-el';
import { utils } from './gui-core';
import { parseColorInput, formatColorInput, colorInputFormats } from './gui-color-input';

export var grayscaleColorPresets = [
  '#000000', '#111111', '#222222', '#333333',
  '#444444', '#555555', '#666666', '#777777',
  '#888888', '#999999', '#aaaaaa', '#bbbbbb',
  '#cccccc', '#dddddd', '#eeeeee', '#ffffff'
];

// Sequential ramps generated in OKLCH for smooth lightness/chroma progression,
// then hue-normalized in the picker HSB space so every chip in a ramp reports
// the same hue in the color picker.
var redRamp = ['#600202', '#8a0303', '#b11b1b', '#cf3b3b', '#e26161', '#ef8b8b', '#f5b8b8', '#fbdede'];
var orangeRamp = ['#94551e', '#a85f1e', '#bd6d26', '#d17f36', '#e39652', '#f0b37d', '#f7cda8', '#fce1ca'];
var brownRamp = ['#442b03', '#634009', '#825a1b', '#9c763b', '#b39361', '#c8b08b', '#dcceb8', '#eee8df'];
var greenRamp = ['#013c06', '#03580b', '#00750b', '#2e9137', '#5daa64', '#8bc190', '#b8d8bb', '#dfebe0'];
var tealRamp = ['#023937', '#005350', '#036f6b', '#058d88', '#02aba5', '#65c4c1', '#a7d9d7', '#d7edec'];
var blueRamp = ['#013550', '#034d73', '#016599', '#0881bf', '#39a5dd', '#77c2e8', '#aed9ef', '#daedf7'];
var indigoRamp = ['#1d2964', '#2d3d8e', '#4053b5', '#596dd1', '#7889e1', '#9ba8eb', '#c0c8f1', '#e1e5f8'];
var purpleRamp = ['#431b54', '#612b78', '#7f3f9a', '#9b5cb5', '#b37dc9', '#c8a0d9', '#dcc4e6', '#eee2f3'];

export var layerColorPresetRows = [
  grayscaleColorPresets,
  redRamp.concat(orangeRamp),
  brownRamp.concat(greenRamp),
  tealRamp.concat(blueRamp),
  indigoRamp.concat(purpleRamp)
];

// The pickers that are open, so that opening one can close the rest. They
// float over their panel and overlap each other -- in Frame properties,
// Background and Neatline are close enough together that two open pickers just
// cover one another. Only open pickers are listed and hide() delists them, so
// this holds at most one entry.
var openPickers = [];

// The format color fields show colors in, chosen with the picker's tabs. It
// is shared by every picker, so it carries over from one to the next.
var colorFieldFormat = 'hex';

function closeOpenPickers(except) {
  openPickers.slice().forEach(function(picker) {
    if (picker !== except) picker.hide();
  });
}

// opts.presetRows   rows of preset colors; [] for none
// opts.onPreview(hex), opts.onChange(hex), opts.onHide()
export function ColorPicker(parent, opts) {
  opts = opts || {};
  var self = this;
  var colorPicker = El('div').addClass('label-color-picker').appendTo(parent).hide();
  var sbCanvas, hueCanvas, sbMarker, hueMarker, colorInput, formatTabs;
  var pickerColor = {h: 0, s: 0, b: 0};
  // The hex value the picker was set to, until it is moved off it. HSB is
  // held in bytes, which cannot represent every RGB colour, so a colour that
  // was typed or picked from a preset would otherwise come back as a
  // neighbour of itself (#ff8800 as #ff8a00).
  var pickerHex = null;
  var presetRows = opts.presetRows || [grayscaleColorPresets];

  init();

  this.toggle = function() {
    if (colorPicker.visible()) {
      this.hide();
    } else {
      closeOpenPickers(self);
      colorPicker.show();
      setPanelRaised(true);
      positionPicker();
      drawColorPicker();
      updatePickerFields();
      if (openPickers.indexOf(self) == -1) openPickers.push(self);
    }
  };

  this.hide = function() {
    var wasVisible = colorPicker.visible();
    colorPicker.hide();
    setPanelRaised(false);
    var i = openPickers.indexOf(self);
    if (i > -1) openPickers.splice(i, 1);
    if (wasVisible && opts.onHide) opts.onHide();
  };

  // The picker's z-index only places it within its panel, which is a stacking
  // context of its own (see .label-style-panel.color-picker-open).
  function setPanelRaised(raised) {
    var panel = colorPicker.node().closest('.label-style-panel');
    if (panel) panel.classList.toggle('color-picker-open', raised);
  }

  this.visible = function() {
    return colorPicker.visible();
  };

  this.setColor = function(color) {
    if (isHexColor(color)) {
      setPickerColor(hexToPickerHsb(color, pickerColor), color);
    }
  };

  this.getColor = getPickerHex;

  function getPickerHex() {
    return pickerHex || hsbToHex(pickerColor);
  }

  // The picker is placed in viewport coordinates (see .label-color-picker), so
  // it has to be put against the field it belongs to each time it opens. The
  // offsets reproduce what the stylesheet used to do with `top: 48px; right: 0`
  // against that field, plus a clamp so that a panel low on the screen cannot
  // push the picker off the bottom.
  function positionPicker() {
    var node = colorPicker.node();
    var anchor = node.parentNode.getBoundingClientRect();
    var margin = 8;
    var top = anchor.top + 48;
    var left = anchor.right - node.offsetWidth;
    if (top + node.offsetHeight + margin > window.innerHeight) {
      top = window.innerHeight - margin - node.offsetHeight;
    }
    colorPicker.css('top', Math.round(Math.max(margin, top)) + 'px');
    colorPicker.css('left', Math.round(Math.max(margin, left)) + 'px');
  }

  function init() {
    var sbWrap = El('div').addClass('label-color-canvas-wrap').appendTo(colorPicker);
    sbCanvas = El('canvas').attr('width', '256').attr('height', '256').appendTo(sbWrap);
    sbMarker = makePickerMarker().appendTo(sbWrap);
    var hueWrap = El('div').addClass('label-color-canvas-wrap').appendTo(colorPicker);
    hueCanvas = El('canvas').attr('width', '256').attr('height', '18').appendTo(hueWrap);
    hueMarker = makePickerMarker().appendTo(hueWrap);
    if (presetRows.length > 0) renderPresetRows(colorPicker);
    // a field for a typed or pasted color, with tabs for the format it shows
    // colors in
    addFormatTabs(colorPicker);
    var fieldRow = El('div').addClass('label-color-picker-fields').appendTo(colorPicker);
    addColorInput(fieldRow);
    El('button').appendTo(fieldRow).text('Close').on('click', function() {
      self.hide();
    });
    sbCanvas.on('mousedown', function(e) {
      startCanvasDrag(e, updateSbFromEvent);
    });
    hueCanvas.on('mousedown', function(e) {
      startCanvasDrag(e, updateHueFromEvent);
    });
    setPickerColor(pickerColor);
  }

  function renderPresetRows(parent) {
    var container = El('div').addClass('label-color-presets').appendTo(parent);
    presetRows.forEach(function(row) {
      var rowEl = El('div').addClass('label-color-preset-row').appendTo(container);
      row.forEach(function(color, i) {
        var tile = El('div')
          .addClass('label-color-preset')
          .attr('role', 'button')
          .attr('aria-label', color)
          .appendTo(rowEl)
          .css('background-color', color);
        if (row.length == 16 && i == 8) tile.addClass('label-color-preset-group-start');
        tile.on('click', function() {
          applyPreset(color);
        });
      });
    });
  }

  function applyPreset(color) {
    setPickerColor(hexToPickerHsb(color, pickerColor), color);
    commitPickerColor();
  }

  function addFormatTabs(parent) {
    var row = El('div').addClass('label-color-format-tabs').attr('role', 'group')
      .attr('aria-label', 'Color format').appendTo(parent);
    formatTabs = colorInputFormats.map(function(format) {
      return El('button').addClass('label-color-format-tab').attr('type', 'button')
        .attr('data-format', format.name).text(format.label).appendTo(row)
        .on('click', function() {
          colorFieldFormat = format.name;
          updatePickerFields();
        });
    });
  }

  // A color is applied when it is pasted, or when the field is left (Enter
  // leaves it, in the style panels). Whatever was accepted is shown in the
  // chosen format; something that isn't a color puts the field back.
  function addColorInput(row) {
    colorInput = El('input').attr('type', 'text').addClass('label-color-picker-input')
      .attr('aria-label', 'Color: hex, name, rgb(), hsl() or oklch()')
      .attr('spellcheck', 'false')
      .appendTo(row)
      .on('change', applyColorInput)
      .on('paste', function() {
        setTimeout(applyColorInput, 0);
      });
    colorInput.node().addEventListener('keydown', function(e) {
      if (e.key == 'Escape') updatePickerFields();
    });
  }

  function applyColorInput() {
    var hex = parseColorInput(colorInput.node().value);
    if (!hex) {
      updatePickerFields();
      return;
    }
    if (hex == getPickerHex()) {
      updatePickerFields();
      return;
    }
    setPickerColor(hexToPickerHsb(hex, pickerColor), hex);
    commitPickerColor();
  }

  function startCanvasDrag(e, update) {
    var evt = e.originalEvent || e;
    colorPicker.addClass('dragging-color');
    El('body').addClass('dragging-color-picker');
    update(evt);
    document.addEventListener('mousemove', onmove);
    document.addEventListener('mouseup', onup);
    evt.preventDefault();
    function onmove(evt) {
      update(evt);
    }
    function onup() {
      document.removeEventListener('mousemove', onmove);
      document.removeEventListener('mouseup', onup);
      colorPicker.removeClass('dragging-color');
      El('body').removeClass('dragging-color-picker');
      commitPickerColor();
    }
  }

  function updateSbFromEvent(evt) {
    var p = getCanvasPoint(sbCanvas.node(), evt);
    setPickerColor({
      h: pickerColor.h,
      s: p.x,
      b: 255 - p.y
    });
  }

  function updateHueFromEvent(evt) {
    var p = getCanvasPoint(hueCanvas.node(), evt);
    setPickerColor({
      h: p.x,
      s: pickerColor.s,
      b: pickerColor.b
    });
  }

  function getCanvasPoint(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: clamp(Math.round((evt.clientX - rect.left) / rect.width * (canvas.width - 1)), 0, canvas.width - 1),
      y: clamp(Math.round((evt.clientY - rect.top) / rect.height * (canvas.height - 1)), 0, canvas.height - 1)
    };
  }

  // @hex: the exact colour, when @hsb was made from one
  function setPickerColor(hsb, hex) {
    pickerColor = {
      h: clamp(Math.round(hsb.h), 0, 255),
      s: clamp(Math.round(hsb.s), 0, 255),
      b: clamp(Math.round(hsb.b), 0, 255)
    };
    pickerHex = hex || null;
    drawColorPicker();
    updatePickerFields();
    if (opts.onPreview) opts.onPreview(getPickerHex());
  }

  function updatePickerFields() {
    colorInput.node().value = formatColorInput(getPickerHex(), colorFieldFormat);
    formatTabs.forEach(function(tab) {
      var selected = tab.node().getAttribute('data-format') == colorFieldFormat;
      tab.classed('selected', selected).attr('aria-pressed', String(selected));
    });
  }

  function drawColorPicker() {
    if (!sbCanvas) return;
    drawSaturationBrightnessCanvas();
    drawHueCanvas();
  }

  function drawSaturationBrightnessCanvas() {
    var ctx = sbCanvas.node().getContext('2d');
    var image = ctx.createImageData(256, 256);
    var data = image.data;
    var i = 0;
    for (var y=0; y<256; y++) {
      for (var x=0; x<256; x++) {
        var rgb = hsbToRgb({
          h: pickerColor.h,
          s: x,
          b: 255 - y
        });
        data[i++] = rgb.r;
        data[i++] = rgb.g;
        data[i++] = rgb.b;
        data[i++] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    positionMarker(sbMarker, pickerColor.s, 255 - pickerColor.b, pickerColor);
  }

  function drawHueCanvas() {
    var ctx = hueCanvas.node().getContext('2d');
    var image = ctx.createImageData(256, 18);
    var data = image.data;
    var i = 0;
    for (var y=0; y<18; y++) {
      for (var x=0; x<256; x++) {
        var rgb = hsbToRgb({h: x, s: 255, b: 255});
        data[i++] = rgb.r;
        data[i++] = rgb.g;
        data[i++] = rgb.b;
        data[i++] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    positionMarker(hueMarker, pickerColor.h, 9, {h: pickerColor.h, s: 255, b: 255});
  }

  function commitPickerColor() {
    if (opts.onChange) opts.onChange(getPickerHex());
  }

  function getMarkerColor(rgb) {
    var luminance = rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
    return luminance < 128 ? '#fff' : '#000';
  }

  function makePickerMarker() {
    return El('<svg class="label-color-marker" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"></circle></svg>');
  }

  function positionMarker(marker, x, y, hsb) {
    var rgb = hsbToRgb(hsb);
    x = utils.clamp(x, 1, 254);
    y = utils.clamp(y, 1, 254) + 0.5;
    marker.css({
      left: x - 8,
      top: y - 8
    });
    marker.findChild('circle').attr('stroke', getMarkerColor(rgb));
  }
}

export function isHexColor(str) {
  return /^#[0-9a-f]{6}$/i.test(str);
}

// A gray has no hue and black has no saturation either, so those components
// are kept from @prev; otherwise a gray fed back to the picker (e.g. by a
// panel echoing the committed color) would reset the hue slider to red.
export function hexToPickerHsb(hex, prev) {
  var hsb = hexToHsb(hex);
  if (prev && (hsb.s === 0 || hsb.b === 0)) hsb.h = prev.h;
  if (prev && hsb.b === 0) hsb.s = prev.s;
  return hsb;
}

function hexToHsb(hex) {
  var r = parseInt(hex.substr(1, 2), 16);
  var g = parseInt(hex.substr(3, 2), 16);
  var b = parseInt(hex.substr(5, 2), 16);
  var max = Math.max(r, g, b);
  var min = Math.min(r, g, b);
  var d = max - min;
  var h = 0;
  if (d) {
    if (max == r) h = ((g - b) / d) % 6;
    else if (max == g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return {
    h: Math.round(h / 360 * 255),
    s: Math.round(max === 0 ? 0 : d / max * 255),
    b: max
  };
}

function hsbToHex(hsb) {
  var rgb = hsbToRgb(hsb);
  return '#' + [rgb.r, rgb.g, rgb.b].map(function(val) {
    return val.toString(16).padStart(2, '0');
  }).join('');
}

function hsbToRgb(hsb) {
  var h = hsb.h / 255 * 360;
  var s = hsb.s / 255;
  var v = hsb.b / 255;
  var c = v * s;
  var x = c * (1 - Math.abs((h / 60) % 2 - 1));
  var m = v - c;
  var rgb = h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] : [c, 0, x];
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255)
  };
}

function clamp(val, min, max) {
  return isFinite(val) ? Math.max(min, Math.min(max, val)) : min;
}
