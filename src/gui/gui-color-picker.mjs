import { El } from './gui-el';
import { utils } from './gui-core';

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

export function ColorPicker(parent, opts) {
  opts = opts || {};
  var colorPicker = El('div').addClass('label-color-picker').appendTo(parent).hide();
  var sbCanvas, hueCanvas, sbMarker, hueMarker, pickerHsbInputs;
  var pickerColor = {h: 0, s: 0, b: 0};
  var presetRows = opts.presetRows || [grayscaleColorPresets];

  init();

  this.toggle = function() {
    if (colorPicker.visible()) {
      this.hide();
    } else {
      colorPicker.show();
      drawColorPicker();
    }
  };

  this.hide = function() {
    colorPicker.hide();
  };

  this.visible = function() {
    return colorPicker.visible();
  };

  this.setColor = function(color) {
    if (isHexColor(color)) {
      setPickerColor(hexToHsb(color));
    }
  };

  this.getColor = function() {
    return hsbToHex(pickerColor);
  };

  function init() {
    var sbWrap = El('div').addClass('label-color-canvas-wrap').appendTo(colorPicker);
    sbCanvas = El('canvas').attr('width', '256').attr('height', '256').appendTo(sbWrap);
    sbMarker = makePickerMarker().appendTo(sbWrap);
    var hueWrap = El('div').addClass('label-color-canvas-wrap').appendTo(colorPicker);
    hueCanvas = El('canvas').attr('width', '256').attr('height', '18').appendTo(hueWrap);
    hueMarker = makePickerMarker().appendTo(hueWrap);
    renderPresetRows(colorPicker);
    pickerHsbInputs = {};
    var hsbRow = El('div').addClass('label-color-picker-fields').appendTo(colorPicker);
    addPickerNumberInput(hsbRow, 'h', 'H');
    addPickerNumberInput(hsbRow, 's', 'S');
    addPickerNumberInput(hsbRow, 'b', 'B');
    El('button').appendTo(hsbRow).text('Close').on('click', function() {
      colorPicker.hide();
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
          .attr('tabindex', '0')
          .attr('title', color)
          .appendTo(rowEl)
          .css('background-color', color);
        if (row.length == 16 && i == 8) tile.addClass('label-color-preset-group-start');
        tile.on('click', function() {
          applyPreset(color);
        }).on('keydown', function(e) {
          if (e.key == 'Enter' || e.key == ' ') {
            e.preventDefault();
            applyPreset(color);
          }
        });
      });
    });
  }

  function applyPreset(color) {
    setPickerColor(hexToHsb(color));
    commitPickerColor();
  }

  function addPickerNumberInput(row, name, label) {
    var wrapper = El('label').appendTo(row);
    El('span').appendTo(wrapper).text(label);
    pickerHsbInputs[name] = El('input')
      .attr('type', 'text')
      .appendTo(wrapper)
      .on('change', function() {
        var h = parseNumberField(pickerHsbInputs.h.node().value);
        var s = parseNumberField(pickerHsbInputs.s.node().value);
        var b = parseNumberField(pickerHsbInputs.b.node().value);
        if (!isFinite(h) || !isFinite(s) || !isFinite(b)) return;
        setPickerColor({
          h: degreesToByte(h),
          s: pctToByte(s),
          b: pctToByte(b)
        });
        commitPickerColor();
      });
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

  function setPickerColor(hsb) {
    pickerColor = {
      h: clamp(Math.round(hsb.h), 0, 255),
      s: clamp(Math.round(hsb.s), 0, 255),
      b: clamp(Math.round(hsb.b), 0, 255)
    };
    drawColorPicker();
    updatePickerFields();
    if (opts.onPreview) opts.onPreview(hsbToHex(pickerColor));
  }

  function updatePickerFields() {
    pickerHsbInputs.h.node().value = byteToDegrees(pickerColor.h) + '°';
    pickerHsbInputs.s.node().value = byteToPct(pickerColor.s) + '%';
    pickerHsbInputs.b.node().value = byteToPct(pickerColor.b) + '%';
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
    if (opts.onChange) opts.onChange(hsbToHex(pickerColor));
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

function byteToPct(val) {
  return Math.round(val / 255 * 100);
}

function pctToByte(val) {
  return Math.round(clamp(val, 0, 100) / 100 * 255);
}

function byteToDegrees(val) {
  return Math.round(val / 255 * 360);
}

function degreesToByte(val) {
  return Math.round(clamp(val, 0, 360) / 360 * 255);
}

function parseNumberField(str) {
  return Number(String(str).replace(/[°%]/g, '').trim());
}

function clamp(val, min, max) {
  return isFinite(val) ? Math.max(min, Math.min(max, val)) : min;
}
