import {
  resolveRamp, resolveRampTiles, getPinnedSlots, setRampPin, clearRampPin
} from '../src/color/color-ramps';
import {
  rgbToOklab, oklabToRgb, interpolateOklch, oklabToOklch, oklchToRgb,
  oklabIsInGamut, getMaxChroma, getOklchInterpolator, getVibrantColor
} from '../src/color/oklab';
import { parseColor } from '../src/color/color-utils';

function toLch(color) {
  return oklabToOklch(rgbToOklab(parseColor(color)));
}

function hueDiff(a, b) {
  var d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
import api from '../mapshaper.js';
import assert from 'assert';

describe('color-ramps.mjs and oklab.mjs', function () {

  describe('rgbToOklab() / oklabToRgb()', function () {
    it('white and black have the reference lightness values', function () {
      var white = rgbToOklab({r: 255, g: 255, b: 255});
      var black = rgbToOklab({r: 0, g: 0, b: 0});
      assert(Math.abs(white.l - 1) < 1e-4);
      assert(Math.abs(white.a) < 1e-4 && Math.abs(white.b) < 1e-4);
      assert.equal(black.l, 0);
    });

    it('matches a published reference value for sRGB red', function () {
      var red = rgbToOklab({r: 255, g: 0, b: 0});
      assert(Math.abs(red.l - 0.6279554) < 1e-4);
      assert(Math.abs(red.a - 0.2248631) < 1e-4);
      assert(Math.abs(red.b - 0.1258463) < 1e-4);
    });

    it('round-trips sRGB colors', function () {
      [[12, 200, 77], [255, 255, 0], [3, 4, 250], [128, 128, 128]].forEach(function(arr) {
        var rgb = oklabToRgb(rgbToOklab({r: arr[0], g: arr[1], b: arr[2]}));
        assert(Math.abs(rgb.r - arr[0]) < 0.01);
        assert(Math.abs(rgb.g - arr[1]) < 0.01);
        assert(Math.abs(rgb.b - arr[2]) < 0.01);
      });
    });

    it('clips out-of-gamut colors', function () {
      var rgb = oklabToRgb({l: 0.9, a: 0.4, b: 0.4});
      [rgb.r, rgb.g, rgb.b].forEach(function(c) {
        assert(c >= 0 && c <= 255);
      });
    });
  });

  describe('interpolateOklch()', function () {
    it('returns the end colors at t=0 and t=1', function () {
      var f = interpolateOklch('#fbe9d9', '#2f6b1f');
      assert.equal(f(0), '#fbe9d9');
      assert.equal(f(1), '#2f6b1f');
    });

    it('steps lightness, chroma and hue evenly', function () {
      // cream to dark green, which stays inside the sRGB gamut
      var a = toLch('#fbe9d9'), b = toLch('#2f6b1f');
      var f = interpolateOklch('#fbe9d9', '#2f6b1f');
      [0.25, 0.5, 0.75].forEach(function(t) {
        var lch = toLch(f(t));
        assert(Math.abs(lch.l - (a.l + (b.l - a.l) * t)) < 0.005, 'lightness at ' + t);
        assert(Math.abs(lch.c - (a.c + (b.c - a.c) * t)) < 0.005, 'chroma at ' + t);
        assert(hueDiff(lch.h, a.h + (b.h - a.h) * t) < 2, 'hue at ' + t);
      });
    });

    it('keeps the midpoint of two saturated hues saturated', function () {
      // a straight line through OKLab would pass near gray
      var a = rgbToOklab(parseColor('#d62728')), b = rgbToOklab(parseColor('#1f77b4'));
      var straight = oklabToOklch({l: (a.l + b.l) / 2, a: (a.a + b.a) / 2, b: (a.b + b.b) / 2});
      var lch = toLch(interpolateOklch('#d62728', '#1f77b4')(0.5));
      assert(lch.c > straight.c * 2);
    });

    it('takes the shorter way around the hue circle', function () {
      // red (h=29) to magenta (h=328): through pink, not through green
      var a = toLch('#ff0000'), b = toLch('#ff00ff');
      var h = toLch(interpolateOklch('#ff0000', '#ff00ff')(0.5)).h;
      assert(hueDiff(h, (a.h + b.h + 360) / 2) < 2, String(h));
    });

    it('a gray end takes the hue of the other end', function () {
      var blue = toLch('#1f77b4');
      var f = interpolateOklch('#ffffff', '#1f77b4');
      [0.25, 0.5, 0.75].forEach(function(t) {
        assert(hueDiff(toLch(f(t)).h, blue.h) < 2);
      });
    });

    it('two grays give a gray ramp', function () {
      assert.equal(interpolateOklch('#000', '#fff')(0.5), '#636363');
    });

    it('interpolates alpha', function () {
      assert.equal(interpolateOklch('rgba(255,0,0,0)', 'rgba(255,0,0,1)')(0.5), 'rgba(255,0,0,0.5)');
    });
  });

  describe('interpolateOklch() vibrance', function () {
    // near-black navy to cream: dull midtones, with room for more chroma
    var dark = '#011521', light = '#fff8e1';

    it('raises chroma, keeping lightness and hue', function () {
      var plain = toLch(interpolateOklch(dark, light)(0.5));
      var vivid = toLch(interpolateOklch(dark, light, {vibrance: 0.04})(0.5));
      assert(vivid.c > plain.c + 0.015, String(vivid.c));
      assert(Math.abs(vivid.l - plain.l) < 0.003);
      assert(hueDiff(vivid.h, plain.h) < 1);
    });

    it('adds the same chroma at every hue', function () {
      ['#3b0f0f', '#1a0a2e', '#001e56'].forEach(function(color) {
        var f = getOklchInterpolator(color, '#fff8e1', {vibrance: 0.05, steps: 4});
        var g = getOklchInterpolator(color, '#fff8e1', {steps: 4});
        assert(Math.abs(f(0.75).ideal.c - g(0.75).ideal.c - 0.05) < 1e-9);
      });
    });

    it('raises the ends\' chroma as far as the gamut allows at their lightness', function () {
      var f = getOklchInterpolator('#344a72', light, {vibrance: 0.04});
      var navy = toLch('#344a72'), cream = toLch(light);
      var end = f(0), lightEnd = f(1);
      assert(Math.abs(end.ideal.c - (navy.c + 0.04)) < 1e-9);
      assert.equal(end.l, navy.l);
      assert.equal(end.adjusted, false);
      assert.equal(lightEnd.ideal.c, Math.min(cream.c + 0.04, getMaxChroma(cream.l, cream.h)));
      assert(lightEnd.ideal.c < cream.c + 0.04);
      assert.equal(lightEnd.l, cream.l);
      assert.equal(lightEnd.adjusted, false);
      assert.equal(f(0).color, getVibrantColor('#344a72', 0.04));
    });

    it('vibrance 0 leaves the ends alone', function () {
      var f = interpolateOklch(dark, light, {vibrance: 0});
      assert.equal(f(0), '#011521');
      assert.equal(f(1), '#fff8e1');
    });

    it('does not tint gray ends', function () {
      var f = interpolateOklch('#344a72', '#ffffff', {vibrance: 0.1});
      assert.equal(f(1), '#ffffff');
      assert.equal(getVibrantColor('#777', 0.1), '#777777');
    });

    it('does not tint a ramp between two grays', function () {
      assert.equal(interpolateOklch('#000', '#fff', {vibrance: 0.1})(0.5), '#636363');
    });

    describe('in a classed ramp', function () {
      var pins = [{t: 0, color: '#344a72'}, {t: 1, color: '#f7ffec'}];

      it('vibrance 0 is the straight interpolation', function () {
        assert.deepEqual(resolveRamp(pins, 5, {vibrance: 0}), resolveRamp(pins, 5));
      });

      it('adds vibrance to the chroma of every interpolated tile', function () {
        var plain = resolveRampTiles(pins, 5);
        var vivid = resolveRampTiles(pins, 5, {vibrance: 0.02});
        [1, 2, 3].forEach(function(i) {
          assert(Math.abs(vivid[i].ideal.c - plain[i].ideal.c - 0.02) < 1e-9);
        });
      });

      it('raises the pinned tiles too', function () {
        var tiles = resolveRampTiles(pins, 5, {vibrance: 0.02});
        assert.equal(tiles[0].color, getVibrantColor('#344a72', 0.02));
        assert.equal(tiles[4].color, getVibrantColor('#f7ffec', 0.02));
        assert.notEqual(tiles[0].color, '#344a72');
        assert.equal(tiles[0].adjusted, false);
      });

      it('marks pinned tiles whose vibrance the gamut cut short', function () {
        var light = toLch('#f7ffec');
        var tile = resolveRampTiles(pins, 5, {vibrance: 0.09})[4];
        assert.equal(tile.adjusted, true);
        assert(Math.abs(tile.ideal.c - (light.c + 0.09)) < 1e-9);
        assert.equal(tile.c, getMaxChroma(light.l, light.h));
        assert.equal(tile.l, light.l);
      });

      it('does not mark gray pinned tiles', function () {
        var tiles = resolveRampTiles([{t: 0, color: '#344a72'}, {t: 1, color: '#fff'}], 5, {vibrance: 0.09});
        assert.equal(tiles[4].adjusted, false);
        assert.equal(tiles[4].color, '#ffffff');
      });

      it('works with the light end on either side', function () {
        var reversed = pins.map(function(pin) { return {t: 1 - pin.t, color: pin.color}; }).reverse();
        var a = resolveRamp(pins, 5, {vibrance: 0.02});
        var b = resolveRamp(reversed, 5, {vibrance: 0.02});
        assert.deepEqual(a, b.reverse());
      });
    });
  });

  describe('getOklchInterpolator() hue path', function () {
    var blue = '#2050c0', orange = '#d07020';

    it('takes the shorter way around by default', function () {
      var a = toLch(blue).h, b = toLch(orange).h;
      var mid = getOklchInterpolator(blue, orange)(0.5).ideal.h;
      var d = b - a;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      assert(hueDiff(mid, a + d / 2) < 1e-6);
    });

    it('hue=longer takes the other way, keeping the ends', function () {
      var short = getOklchInterpolator(blue, orange)(0.5).ideal.h;
      var long = getOklchInterpolator(blue, orange, {hue: 'longer'});
      assert(Math.abs(hueDiff(long(0.5).ideal.h, short) - 180) < 1e-6);
      assert.equal(long(0).color, interpolateOklch(blue, orange)(0));
      assert.equal(long(1).color, interpolateOklch(blue, orange)(1));
    });

    it('goes all the way around between two colors of the same hue', function () {
      var f = getOklchInterpolator('#2050c0', '#a0b8f0', {hue: 'longer'});
      assert(hueDiff(f(0.5).ideal.h, toLch('#2050c0').h) > 170);
    });

    it('has no effect with a gray end', function () {
      assert.equal(interpolateOklch(blue, '#ffffff', {hue: 'longer'})(0.5),
        interpolateOklch(blue, '#ffffff')(0.5));
    });

    it('applies to each segment of a ramp', function () {
      var pins = [{t: 0, color: blue}, {t: 1, color: orange}];
      var a = resolveRamp(pins, 5, {hue: 'longer'});
      assert.equal(a[2], interpolateOklch(blue, orange, {hue: 'longer', steps: 4})(0.5));
    });
  });

  describe('getOklchInterpolator() lightness shift for vibrance', function () {
    // navy to cream: the cream end has little room for chroma, so it gains
    // less than the tile next to it, at t = 0.75
    var navy = '#344a72', cream = '#fff8de';
    var SHIFT = 0.2;
    function lightness(opts, a, b) {
      var f = getOklchInterpolator(a || navy, b || cream, Object.assign({steps: 4}, opts));
      return [0, 0.25, 0.5, 0.75, 1].map(function(t) { return f(t).ideal.l; });
    }
    // the chroma gained at t, as far as the gamut allows at the straight
    // interpolation's lightness
    function gain(vibrance, t, a, b) {
      var f = getOklchInterpolator(a || navy, b || cream, {steps: 4});
      var lin = f(t).ideal;
      if (t == 1) return getOklchInterpolator(a || navy, b || cream, {steps: 4, vibrance: vibrance})(1).ideal.c - lin.c;
      return Math.min(lin.c + vibrance, getMaxChroma(lin.l, lin.h)) - lin.c;
    }

    it('vibrance 0 keeps even lightness steps', function () {
      var ls = lightness({});
      assert(Math.abs((ls[4] - ls[3]) - (ls[1] - ls[0])) < 1e-9);
    });

    it('moves the color next to the light end by a share of the difference in chroma gained', function () {
      var diff = gain(0.04, 0.75) - gain(0.04, 1);
      assert(diff > 0.01);
      var l = lightness({vibrance: 0.04})[3];
      assert(Math.abs(l - lightness({})[3] - SHIFT * diff) < 1e-9);
    });

    it('a white end gains no chroma, so the next color gets the whole shift', function () {
      var a = '#08306b', b = '#ffffff';
      var g = gain(0.15, 0.75, a, b);
      assert(g > 0 && g < 0.1); // the gamut has little room for blue near white
      var l = lightness({vibrance: 0.15}, a, b)[3];
      assert(Math.abs(l - lightness({}, a, b)[3] - SHIFT * g) < 1e-9);
    });

    it('no shift when the light end gains as much chroma as the next color', function () {
      // a mid-lightness light end, with room for chroma
      var a = '#1d2a5c', b = '#9ad18b';
      assert(Math.abs(gain(0.02, 1, a, b) - 0.02) < 1e-9);
      var plain = lightness({}, a, b);
      lightness({vibrance: 0.02}, a, b).forEach(function(l, i) {
        assert(Math.abs(l - plain[i]) < 1e-9);
      });
    });

    it('spaces the other tiles evenly from the shifted color to the dark end', function () {
      var ls = lightness({vibrance: 0.04});
      var d1 = ls[1] - ls[0], d2 = ls[2] - ls[1], d3 = ls[3] - ls[2];
      assert(Math.abs(d1 - d2) < 1e-9 && Math.abs(d2 - d3) < 1e-9);
    });

    it('does not move the ends', function () {
      var ls = lightness({vibrance: 0.04}), plain = lightness({});
      assert.equal(ls[0], plain[0]);
      assert.equal(ls[4], plain[4]);
    });

    it('applies only to classed ramps', function () {
      var f = getOklchInterpolator(navy, cream, {vibrance: 0.04});
      var even = toLch(navy).l + (toLch(cream).l - toLch(navy).l) * 0.75;
      assert(Math.abs(f(0.75).ideal.l - even) < 1e-9);
    });
  });

  describe('getOklchInterpolator() gamut fitting', function () {
    var navy = '#001e56', cream = '#fcf1cd';

    it('colors that fit are not adjusted', function () {
      var tile = getOklchInterpolator('#fbe9d9', '#2f6b1f')(0.5);
      assert.equal(tile.adjusted, false);
      assert.equal(tile.l, tile.ideal.l);
      assert.equal(tile.c, tile.ideal.c);
    });

    // the weighted color difference that fitting minimizes
    function fitCost(tile, l) {
      var dl = (l - tile.ideal.l) * 2;
      var dc = Math.max(0, tile.ideal.c - getMaxChroma(l, tile.h));
      return dl * dl + dc * dc;
    }

    it('picks the lightness that brings the color closest to its ideal', function () {
      [0.25, 0.5].forEach(function(t) {
        var tile = getOklchInterpolator(navy, cream, {vibrance: 0.15})(t);
        var cost = fitCost(tile, tile.l);
        assert(getMaxChroma(tile.ideal.l, tile.h) < tile.ideal.c);
        [-0.05, -0.01, -0.002, 0, 0.002, 0.01, 0.05].forEach(function(dl) {
          assert(cost <= fitCost(tile, tile.ideal.l + dl) + 1e-9, t + ' ' + dl);
        });
        assert(Math.abs(tile.c - Math.min(tile.ideal.c, getMaxChroma(tile.l, tile.h))) < 1e-9);
        assert.equal(tile.adjusted, true);
        assert(oklabIsInGamut(rgbToOklab(parseColor(tile.color))));
      });
    });

    it('moves lightness only a little where the gamut gains little chroma from it', function () {
      // dark cyan: sRGB holds little more chroma at higher lightness
      var tile = getOklchInterpolator(navy, cream, {vibrance: 0.15})(0.25);
      assert(Math.abs(tile.l - tile.ideal.l) < 0.01);
    });

    it('moves lightness no more than 0.05', function () {
      [0.1, 0.25, 0.5, 0.75, 0.9].forEach(function(t) {
        var tile = getOklchInterpolator('#000080', '#ffff00', {vibrance: 0.4})(t);
        assert(Math.abs(tile.l - tile.ideal.l) <= 0.05 + 1e-9);
      });
    });

    it('moves lightness less when the tiles are close together', function () {
      var f = getOklchInterpolator(navy, cream, {vibrance: 0.04, steps: 12});
      var tile = f(0.5);
      var limit = 0.2 * (toLch(cream).l - toLch(navy).l) / 12;
      assert(Math.abs(tile.l - tile.ideal.l) <= limit + 1e-9);
    });
  });

  describe('oklchToRgb()', function () {
    it('leaves in-gamut colors alone', function () {
      var rgb = oklchToRgb(toLch('#2f6b1f'));
      assert(Math.abs(rgb.r - 0x2f) < 0.01 && Math.abs(rgb.g - 0x6b) < 0.01 && Math.abs(rgb.b - 0x1f) < 0.01);
    });

    it('brings out-of-gamut colors in by reducing chroma, keeping hue and lightness', function () {
      var target = {l: 0.75, c: 0.3, h: 190}; // a cyan far outside sRGB
      var rgb = oklchToRgb(target);
      var lch = oklabToOklch(rgbToOklab(rgb));
      assert(oklabIsInGamut(rgbToOklab(rgb)));
      assert(Math.abs(lch.l - target.l) < 0.002);
      assert(hueDiff(lch.h, target.h) < 0.5);
      assert(lch.c < target.c && lch.c > 0.05);
    });
  });

  describe('resolveRamp()', function () {
    var ends = [{t: 0, color: '#000000'}, {t: 1, color: '#ffffff'}];

    it('two pins, two tiles', function () {
      assert.deepEqual(resolveRamp(ends, 2), ['#000000', '#ffffff']);
    });

    it('fills intermediate tiles by OKLCH interpolation', function () {
      var colors = resolveRamp(ends, 3);
      assert.deepEqual(colors, ['#000000', interpolateOklch('#000', '#fff', {steps: 2})(0.5), '#ffffff']);
    });

    it('normalizes pin colors to hex', function () {
      var colors = resolveRamp([{t: 0, color: 'red'}, {t: 1, color: 'rgb(0,0,255)'}], 2);
      assert.deepEqual(colors, ['#ff0000', '#0000ff']);
    });

    it('interpolates between interior pins', function () {
      var pins = ends.concat({t: 0.5, color: '#ff0000'});
      var colors = resolveRamp(pins, 5);
      assert.equal(colors[0], '#000000');
      assert.equal(colors[2], '#ff0000');
      assert.equal(colors[4], '#ffffff');
      assert.equal(colors[1], interpolateOklch('#000000', '#ff0000', {steps: 2})(0.5));
      assert.equal(colors[3], interpolateOklch('#ff0000', '#ffffff', {steps: 2})(0.5));
    });

    it('requires pins at both ends', function () {
      assert.throws(function() {
        resolveRamp([{t: 0, color: '#000'}, {t: 0.5, color: '#fff'}], 3);
      });
    });

    it('requires at least two tiles', function () {
      assert.throws(function() { resolveRamp(ends, 1); });
    });
  });

  describe('getPinnedSlots()', function () {
    it('snaps pins to the nearest tile', function () {
      var pins = [{t: 0, color: '#000'}, {t: 0.3, color: 'red'}, {t: 1, color: '#fff'}];
      assert.deepEqual(getPinnedSlots(pins, 5), [0, 1, -1, -1, 2]);
      assert.deepEqual(getPinnedSlots(pins, 3), [0, 1, 2]);
    });

    it('end pins win collisions', function () {
      var pins = [{t: 0, color: '#000'}, {t: 0.1, color: 'red'}, {t: 1, color: '#fff'}];
      assert.deepEqual(getPinnedSlots(pins, 3), [0, -1, 2]);
    });

    it('the pin closest to the tile wins other collisions', function () {
      var pins = [{t: 0, color: '#000'}, {t: 0.4, color: 'red'},
        {t: 0.55, color: 'blue'}, {t: 1, color: '#fff'}];
      assert.deepEqual(getPinnedSlots(pins, 3), [0, 2, 3]);
    });
  });

  describe('setRampPin() / clearRampPin()', function () {
    var ends = [{t: 0, color: '#000'}, {t: 1, color: '#fff'}];

    it('pins a middle tile by position', function () {
      var pins = setRampPin(ends, 5, 1, 'red');
      assert.deepEqual(pins, [{t: 0, color: '#000'}, {t: 0.25, color: 'red'}, {t: 1, color: '#fff'}]);
    });

    it('pins survive a change in the number of tiles', function () {
      var pins = setRampPin(ends, 5, 2, 'red');
      assert.deepEqual(getPinnedSlots(pins, 7), [0, -1, -1, 1, -1, -1, 2]);
    });

    it('replaces an existing pin on the same tile', function () {
      var pins = setRampPin(setRampPin(ends, 5, 2, 'red'), 5, 2, 'blue');
      assert.deepEqual(pins, [{t: 0, color: '#000'}, {t: 0.5, color: 'blue'}, {t: 1, color: '#fff'}]);
    });

    it('changes the color of an end pin', function () {
      var pins = setRampPin(ends, 5, 4, 'navy');
      assert.deepEqual(pins, [{t: 0, color: '#000'}, {t: 1, color: 'navy'}]);
    });

    it('does not modify its input', function () {
      setRampPin(ends, 5, 2, 'red');
      assert.equal(ends.length, 2);
    });

    it('unpins a middle tile', function () {
      var pins = setRampPin(ends, 5, 2, 'red');
      assert.deepEqual(clearRampPin(pins, 5, 2), ends);
    });

    it('does not unpin end tiles', function () {
      assert.deepEqual(clearRampPin(ends, 5, 0), ends);
      assert.deepEqual(clearRampPin(ends, 5, 4), ends);
    });

    it('rejects an invalid tile index', function () {
      assert.throws(function() { setRampPin(ends, 5, 5, 'red'); });
      assert.throws(function() { clearRampPin(ends, 5, 1.5); });
    });
  });

  describe('-classify interpolation=', function () {
    var data = 'value\n1\n2\n3';

    async function classify(opts) {
      var out = await api.applyCommands('-i data.csv -classify value ' + opts +
        ' -o format=json', {'data.csv': data});
      return JSON.parse(out['data.json']).map(function(d) { return d.fill; });
    }

    it('oklch interpolates lightness, chroma and hue', async function () {
      var fills = await classify('colors=#fbe9d9,#2f6b1f classes=3 equal-interval interpolation=oklch');
      assert.deepEqual(fills, ['#fbe9d9', interpolateOklch('#fbe9d9', '#2f6b1f', {steps: 2})(0.5), '#2f6b1f']);
    });

    it('rgb is the default', async function () {
      var a = await classify('colors=#000,#fff classes=3 equal-interval');
      var b = await classify('colors=#000,#fff classes=3 equal-interval interpolation=rgb');
      assert.deepEqual(a, b);
      assert.notEqual(a[1], '#636363');
    });

    it('applies to continuous output', async function () {
      var fills = await classify('colors=#000,#fff continuous classes=2 equal-interval interpolation=oklch');
      assert.deepEqual(fills, ['#000000', '#636363', '#ffffff']);
    });

    it('rejects unknown methods', async function () {
      await assert.rejects(classify('colors=#000,#fff interpolation=hsl'));
      await assert.rejects(classify('colors=#000,#fff interpolation=oklab'), /expected rgb or oklch/);
    });

    it('vibrance= raises chroma, and implies oklch', async function () {
      // vibrance=0.5 is half of the 0.09 OKLCH chroma that vibrance=1 adds
      var chroma = 0.045;
      var expected = interpolateOklch('#011521', '#fff8e1', {vibrance: chroma, steps: 2})(0.5);
      var a = await classify('colors=#011521,#fff8e1 classes=3 equal-interval vibrance=0.5');
      var b = await classify('colors=#011521,#fff8e1 classes=3 equal-interval interpolation=oklch vibrance=0.5');
      assert.deepEqual(a, [getVibrantColor('#011521', chroma), expected, getVibrantColor('#fff8e1', chroma)]);
      assert.notEqual(a[0], '#011521');
      assert.deepEqual(b, a);
      assert.notEqual(expected, interpolateOklch('#011521', '#fff8e1')(0.5));
    });

    it('vibrance= raises the given colors when there is one per class', async function () {
      var a = await classify('colors=#011521,#336699,#fff8e1 classes=3 equal-interval vibrance=1');
      assert.deepEqual(a, ['#011521', '#336699', '#fff8e1'].map(function(c) {
        return getVibrantColor(c, 0.09);
      }));
    });

    it('rejects vibrance= with other methods, or out of range', async function () {
      await assert.rejects(classify('colors=#000,#fff vibrance=0.5 interpolation=rgb'));
      await assert.rejects(classify('colors=#000,#fff vibrance=1.5'), /from 0 to 1/);
      await assert.rejects(classify('colors=#000,#fff vibrance=-0.1'));
    });
  });
});
