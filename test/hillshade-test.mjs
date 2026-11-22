import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

function makeElevation(width, height, fn) {
  var elev = new Float32Array(width * height);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      elev[y * width + x] = fn(x, y);
    }
  }
  return elev;
}

function constantCells(height, size) {
  return new Float64Array(height).fill(size);
}

function shadeAt(fn, lights) {
  var w = 5, h = 5;
  var elev = makeElevation(w, h, fn);
  var shade = internal.computeHillshade(elev, null, w, h, constantCells(h, 1), constantCells(h, 1),
    lights || internal.getHillshadeLights(315, 45, 'hard'), 1);
  return shade[2 * w + 2];
}

// A north-up lat-long elevation grid of about 111 m pixels near the equator
function makeElevationDataset(width, height, fn, opts) {
  var o = opts || {};
  var cell = 0.001;
  var bbox = [0, 0, width * cell, height * cell];
  return {
    info: {crs_string: 'wgs84'},
    layers: [{
      name: 'dem',
      raster_type: 'grid',
      raster: {
        sourceId: 'dem',
        interpretation: 'continuous',
        grid: {
          width: width,
          height: height,
          bands: 1,
          pixelType: 'float32',
          samples: makeElevation(width, height, fn),
          sampleBands: [0],
          nodata: 'nodata' in o ? o.nodata : null,
          bbox: bbox,
          transform: [cell, 0, 0, 0, -cell, bbox[3]]
        },
        derivation: {type: 'gray', sourceId: 'dem', bands: [0]},
        view: {recipe: {type: 'gray', bands: [0]}}
      }
    }]
  };
}

async function runOnDataset(dataset, commands) {
  var catalog = new internal.Catalog().addDataset(dataset);
  var job = new internal.Job(catalog);
  await internal.runParsedCommands(internal.parseCommands(commands), job);
  return job.catalog;
}

describe('mapshaper-hillshade.mjs', function () {

  describe('getHillshadeLights()', function () {
    it('single light', function () {
      assert.deepEqual(internal.getHillshadeLights(300, 30, 'hard'), [{azimuth: 300, altitude: 30, weight: 1}]);
    })

    it('the default is balanced lighting', function () {
      assert.deepEqual(internal.getHillshadeLights(), internal.getHillshadeLights(315, 45, 'balanced'));
    })

    it('balanced and soft lights are balanced around the main light', function () {
      var lights = internal.getHillshadeLights(315, 45, 'balanced');
      assert.deepEqual(lights.map(function(o) { return o.azimuth; }), [225, 270, 315, 360, 405]);
      [lights, internal.getHillshadeLights(315, 45, 'soft')].forEach(function(lights) {
        lights.forEach(function(o, i) {
          assert.equal(o.weight, lights[lights.length - 1 - i].weight);
          assert.equal(o.azimuth - 315, 315 - lights[lights.length - 1 - i].azimuth);
        });
      });
    })

    it('soft lighting lights slopes facing away from the main light', function () {
      var steep = function(x) { return x * 3; }; // a 72 degree slope facing west
      var single = shadeAt(steep, internal.getHillshadeLights(90, 45, 'hard'));
      var soft = shadeAt(steep, internal.getHillshadeLights(90, 45, 'soft'));
      assert.equal(single, 0);
      assert(soft > 0.1);
    })

    it('a list of lights, with azimuths relative to the main light', function () {
      assert.deepEqual(internal.getHillshadeLights(300, 30, '-45:0.3, 0:0.7:60'), [
        {azimuth: 255, altitude: 30, weight: 0.3},
        {azimuth: 300, altitude: 60, weight: 0.7}]);
    })

    it('null for an unknown scheme or an invalid list', function () {
      ['sun', 'gdal', '0:0', '0:1:95', '0:', '0:1,', '45'].forEach(function(str) {
        assert.strictEqual(internal.getHillshadeLights(315, 45, str), null, str);
      });
    })
  })

  describe('getHillshadeMaxShade()', function () {
    // a plane rising @slopeDeg toward @riseDeg (math angle in grid
    // coordinates, where y increases southward); 45 rises toward the
    // southeast, so it faces a northwest light
    function planeShade(slopeDeg, lights, riseDeg) {
      var t = Math.tan(slopeDeg * Math.PI / 180);
      var r = (riseDeg == null ? 45 : riseDeg) * Math.PI / 180;
      var elev = makeElevation(5, 5, function(x, y) { return (x * Math.cos(r) + y * Math.sin(r)) * t; });
      return internal.computeHillshade(elev, null, 5, 5, constantCells(5, 1), constantCells(5, 1), lights, 1)[12];
    }

    it('is 1 / sin(altitude) for a single light', function () {
      assert(Math.abs(internal.getHillshadeMaxShade(internal.getHillshadeLights(315, 45, 'hard')) - Math.SQRT2) < 1e-9);
      assert(Math.abs(internal.getHillshadeMaxShade(internal.getHillshadeLights(315, 30, 'hard')) - 2) < 1e-9);
    })

    it('is the brightest any slope gets under the default lights and opposing lights', function () {
      // the slopes facing the blend of the opposing lights are not the brightest
      [internal.getHillshadeLights(), internal.getHillshadeLights(315, 45, '0:0.6,180:0.4:20')].forEach(function(lights) {
        var max = internal.getHillshadeMaxShade(lights);
        var brightest = 0;
        for (var deg = 0; deg <= 70; deg++) {
          for (var rise = 0; rise < 360; rise += 2) {
            brightest = Math.max(brightest, planeShade(deg, lights, rise));
          }
        }
        assert(max < Math.SQRT2);
        assert(Math.abs(brightest - max) < 0.005, brightest + ' ' + max);
      });
    })

    it('a slope facing the blend of lights gets the full highlight', async function () {
      var maxShade = internal.getHillshadeMaxShade(internal.getHillshadeLights());
      var tones = internal.getHillshadeTones(Float32Array.from([maxShade - 0.001]), null, 'opaque',
        {gamma: 0.75, maxShade: maxShade});
      assert(tones[0] > 0.99);
    })
  })

  describe('getHillshadeHighlightScale()', function () {
    function scale(alt, lighting) {
      return internal.getHillshadeHighlightScale(
        internal.getHillshadeMaxShade(internal.getHillshadeLights(315, alt, lighting)),
        internal.getHillshadeMaxShade(internal.getHillshadeLights(315, 45, lighting)));
    }

    it('scales highlights by the angle from flat ground to the brightest slope, above 45 degrees', function () {
      assert.equal(scale(45, 'hard'), 1);
      assert.equal(scale(20, 'hard'), 1);
      assert(Math.abs(scale(80, 'hard') - 10 / 45) < 1e-9);
      assert(Math.abs(scale(60, 'hard') - 30 / 45) < 1e-9);
      assert.equal(scale(45), 1);
      assert(scale(80) < scale(70) && scale(70) < scale(60) && scale(60) < 1);
    })

    it('transparent -hillshade altitude= above 45 dims the strongest highlight; lower altitudes are unchanged', async function () {
      // the highest opacity of a highlight (a white pixel) on a dome
      async function strongest(cmd) {
        var catalog = await runOnDataset(makeElevationDataset(41, 41, function(x, y) {
          var r2 = (x - 20) * (x - 20) + (y - 20) * (y - 20);
          return r2 < 400 ? Math.sqrt(400 - r2) * 300 : 0;
        }), cmd);
        var samples = catalog.getLayers()[0].layer.raster.grid.samples;
        var max = 0;
        for (var i = 0; i < samples.length; i += 4) {
          if (samples[i] == 255) max = Math.max(max, samples[i + 3]);
        }
        return max;
      }
      var at45 = await strongest('-hillshade lighting=hard');
      assert(at45 > 135);
      assert(await strongest('-hillshade lighting=hard altitude=20') >= at45);
      assert(await strongest('-hillshade lighting=hard altitude=80') < at45 * 0.5);
    })
  })

  describe('opaque -hillshade altitude=', function () {
    // the tone of a plane rising @slopeDeg toward the southeast, facing a
    // northwest light
    function planeTone(slopeDeg, opts) {
      var s = internal.getHillshadeShading(Object.assign({opaque: true}, opts),
        {cells: {median: 1}, minElevation: null}).settings;
      var t = Math.tan(slopeDeg * Math.PI / 180);
      var elev = makeElevation(5, 5, function(x, y) { return (x + y) * Math.SQRT1_2 * t; });
      var shade = internal.computeHillshade(elev, null, 5, 5, constantCells(5, 1), constantCells(5, 1), s.lights, 1);
      return internal.getHillshadeTones(shade.subarray(12, 13), null, s.style, s.toneOpts)[0];
    }

    it('gives a slope the same tone at any altitude, for the same angle to the light', function () {
      [70, 30].forEach(function(alt) {
        [0, 10, 20, 25].forEach(function(angle) {
          // tilted toward the light, @angle beyond the slope facing it
          var tone = planeTone(90 - alt + angle, {lighting: 'hard', altitude: alt});
          var at45 = planeTone(45 + angle, {lighting: 'hard'});
          assert(Math.abs(tone - at45) < 1e-4, alt + ' ' + angle + ': ' + tone + ' ' + at45);
        });
      });
      // flat ground is 20 degrees from a light at 70 degrees
      assert(Math.abs(planeTone(0, {lighting: 'hard', altitude: 70}) - planeTone(25, {lighting: 'hard'})) < 1e-4);
    })

    it('makes flat ground lighter than the base color under a higher light, and darker under a lower one', function () {
      assert.equal(planeTone(0, {}), 0);
      assert(planeTone(0, {altitude: 60}) > 0.2);
      assert(planeTone(0, {altitude: 30}) < -0.2);
      assert(planeTone(0, {altitude: 60}) < planeTone(0, {altitude: 80}));
    })

    it('still gives the slope facing the light the highlight color', function () {
      [20, 80].forEach(function(alt) {
        assert(planeTone(90 - alt, {lighting: 'hard', altitude: alt}) > 0.99);
      });
    })
  })

  describe('getAutoExaggeration()', function () {
    it('is 1 at large scales and grows with pixel size, up to 10', function () {
      assert.equal(internal.getAutoExaggeration(10), 1);
      assert.equal(internal.getAutoExaggeration(50), 1);
      assert.equal(internal.getAutoExaggeration(1000), 4.5); // sqrt(20) = 4.47
      assert.equal(internal.getAutoExaggeration(380), 2.75); // 2.76
      assert.equal(internal.getAutoExaggeration(450), 3); // 3.0
      assert.equal(internal.getAutoExaggeration(1e6), 10);
    })
  })

  describe('computeHillshade()', function () {
    it('flat ground is 1', function () {
      assert(Math.abs(shadeAt(function() { return 100; }) - 1) < 1e-6);
      assert(Math.abs(shadeAt(function() { return 100; }, internal.getHillshadeLights()) - 1) < 1e-6);
    })

    it('slopes facing a northwest light are brighter, slopes facing away are darker', function () {
      // y increases southward, so x + y rises toward the southeast
      var facingLight = shadeAt(function(x, y) { return (x + y) * 0.5; });
      var facingAway = shadeAt(function(x, y) { return -(x + y) * 0.5; });
      assert(facingLight > 1);
      assert(facingAway < 1);
    })

    it('exaggeration steepens slopes', function () {
      var w = 5, h = 5;
      var elev = makeElevation(w, h, function(x, y) { return -(x + y) * 0.2; });
      var lights = internal.getHillshadeLights(315, 45, 'hard');
      var a = internal.computeHillshade(elev, null, w, h, constantCells(h, 1), constantCells(h, 1), lights, 1)[12];
      var b = internal.computeHillshade(elev, null, w, h, constantCells(h, 1), constantCells(h, 1), lights, 3)[12];
      assert(b < a);
    })

    it('invalid pixels are skipped and do not create edges', function () {
      var w = 5, h = 5;
      var elev = makeElevation(w, h, function() { return 100; });
      var valid = new Uint8Array(w * h).fill(1);
      elev[12] = -32768;
      valid[12] = 0;
      var shade = internal.computeHillshade(elev, valid, w, h, constantCells(h, 1), constantCells(h, 1),
        internal.getHillshadeLights(), 1);
      assert.equal(shade[12], 0);
      assert(Math.abs(shade[11] - 1) < 1e-6);
      assert(Math.abs(shade[7] - 1) < 1e-6);
    })
  })

  describe('renderHillshadeRgba()', function () {
    var shade = Float32Array.from([1, 0.5, 1.4, 0]);
    var valid = Uint8Array.from([1, 1, 1, 0]);

    it('shadow style: flat and lit pixels are clear, shaded pixels are black with alpha', function () {
      var rgba = internal.renderHillshadeRgba(shade, valid, 'shadow', {maxOpacity: 1, gamma: 1});
      assert.deepEqual(Array.from(rgba.subarray(0, 7)), [0, 0, 0, 0, 0, 0, 0]);
      assert(rgba[7] > 0 && rgba[7] < 255);
      assert.deepEqual(Array.from(rgba.subarray(8)), [0, 0, 0, 0, 0, 0, 0, 0]);
    })

    it('max opacity caps the darkest shadows', function () {
      var s = Float32Array.from([0, 0.5]);
      var rgba = internal.renderHillshadeRgba(s, null, 'shadow', {maxOpacity: 0.5, gamma: 1});
      var full = internal.renderHillshadeRgba(s, null, 'shadow', {maxOpacity: 1, gamma: 1});
      assert.equal(rgba[3], 128);
      assert(Math.abs(rgba[7] - full[7] / 2) <= 1);
    })

    it('gamma below 1 strengthens faint shading without changing full shadow', function () {
      var s = Float32Array.from([0.9, 0]);
      var opts = {maxOpacity: 1, maxShade: Math.SQRT2};
      var even = internal.renderHillshadeRgba(s, null, 'shadow', Object.assign({gamma: 1}, opts));
      var steep = internal.renderHillshadeRgba(s, null, 'shadow', Object.assign({gamma: 0.6}, opts));
      assert(steep[3] > even[3] * 1.3);
      assert.equal(even[7], 255);
      assert.equal(steep[7], 255);
    })

    it('the tone curve changes steadily with the angle to the brightest slope, with no jump at flat ground', function () {
      // shades of slopes turned 0-90 degrees from the brightest slope
      var maxShade = Math.SQRT2;
      var shades = Float32Array.from({length: 91}, function(_, deg) { return maxShade * Math.cos(deg * Math.PI / 180); });
      var tones = internal.getHillshadeTones(shades, null, 'opaque', {maxShade: maxShade, basePosition: 0.75});
      var steps = Array.from(tones).slice(1).map(function(t, i) { return tones[i] - t; });
      assert(Math.abs(tones[0] - 1) < 1e-6);
      assert(Math.abs(tones[45]) < 0.01); // flat ground
      assert(Math.abs(tones[90] + 1) < 1e-6);
      assert(steps.every(function(d) { return d >= -1e-6; }));
      // in lightness, the steps either side of flat ground (tones are scaled
      // by the base's distance from each end)
      assert(Math.abs(steps[44] * 0.25 - steps[45] * 0.75) < 0.001);
    })

    it('lit slopes get white highlights, capped below the shadow opacity', function () {
      var flat = Math.sin(Math.PI / 4);
      var facing = 1.01 / flat; // just past a slope facing the light, to avoid float32 rounding
      var rgba = internal.renderHillshadeRgba(Float32Array.from([facing, 1, 0]), null, 'shadow',
        {maxOpacity: 0.5, gamma: 1, maxShade: 1 / flat, highlightRatio: 0.6});
      assert.deepEqual(Array.from(rgba.subarray(0, 4)), [255, 255, 255, Math.round(0.5 * 0.6 * 255)]);
      assert.equal(rgba[7], 0);
      assert.equal(rgba[11], 128);
      assert(rgba[3] < rgba[11]);
    })

    it('highlightRatio scales highlights relative to max opacity, capped at 1', function () {
      var flat = Math.sin(Math.PI / 4);
      var facing = 1.01 / flat;
      var half = 1 + 0.5 * (1 / flat - 1);
      var shade = Float32Array.from([facing, half, 0]);
      var rgba = internal.renderHillshadeRgba(shade, null, 'shadow',
        {maxOpacity: 0.5, gamma: 1, maxShade: 1 / flat, highlightRatio: 1});
      var halfway = rgba[7];
      assert.equal(rgba[3], 128);
      assert(halfway > 0 && halfway < 128);
      assert.equal(rgba[11], 128);
      rgba = internal.renderHillshadeRgba(shade, null, 'shadow',
        {maxOpacity: 0.5, gamma: 1, maxShade: 1 / flat, highlightRatio: 4});
      assert.equal(rgba[3], 255);
      assert(rgba[7] > halfway && rgba[7] < 255); // scaled, not clipped
    })

    it('colors replace black and white; a color\'s alpha scales its opacity', function () {
      var colors = {shadow: {r: 40, g: 30, b: 90, a: 0.5}, highlight: {r: 255, g: 240, b: 180, a: 1}};
      var rgba = internal.writeHillshadeRgba(Float32Array.from([-1, 0.5, 0]), null, 'shadow', colors);
      assert.deepEqual(Array.from(rgba), [40, 30, 90, 128, 255, 240, 180, 128, 0, 0, 0, 0]);
    })

    it('highlightRatio scales the highlights without changing the shadows', function () {
      var s = Float32Array.from([0.7, 0.95, 1.1, 1.18]);
      var tones = function(ratio) {
        return internal.getHillshadeTones(s, null, 'shadow', {maxShade: 1.2, highlightRatio: ratio});
      };
      var half = tones(0.5), full = tones(1);
      assert.deepEqual(Array.from(half.subarray(0, 2)), Array.from(full.subarray(0, 2)));
      assert(Math.abs(full[2] - 2 * half[2]) < 1e-6);
      assert(Math.abs(full[3] - 2 * half[3]) < 1e-6);
    })

    it('defaults: max opacity 0.55, highlights 1, gamma 0.7', function () {
      var s = Float32Array.from([0, 0.75, 1.1]);
      var opts = {maxShade: 1.2};
      var rgba = internal.renderHillshadeRgba(s, null, 'shadow', opts);
      var explicit = internal.renderHillshadeRgba(s, null, 'shadow',
        Object.assign({maxOpacity: 0.55, gamma: 0.7, highlightRatio: 1}, opts));
      assert.equal(rgba[3], Math.round(0.55 * 255));
      assert.deepEqual(Array.from(rgba), Array.from(explicit));
      assert(rgba[7] > 0 && rgba[11] > 0);
    })

    function oklch(rgba, i) {
      var o = internal.rgbToOklab({r: rgba[i], g: rgba[i + 1], b: rgba[i + 2]});
      return {l: o.l, c: Math.hypot(o.a, o.b)};
    }

    function rampColors(shadow, highlight, base) {
      return internal.getHillshadeRampColors(shadow && internal.parseColor(shadow),
        base && internal.parseColor(base), highlight && internal.parseColor(highlight));
    }

    function opaqueColors(shadow, highlight, base) {
      return {ramp: internal.getHillshadeColorRamp(rampColors(shadow, highlight, base))};
    }

    function hex(rgb) {
      return internal.formatColor(rgb);
    }

    it('opaque style: tones run from the shadow color through the base to the highlight color', function () {
      var colors = opaqueColors('#305440', '#fcffe7', '#9dba98');
      var rgba = internal.writeHillshadeRgba(Float32Array.from([-1, 0, 1, -0.5, 0.5]), null, 'opaque', colors);
      var shadowL = oklch(rgba, 0).l, baseL = oklch(rgba, 4).l, highlightL = oklch(rgba, 8).l;
      assert.deepEqual(Array.from(rgba.subarray(0, 12)), [0x30, 0x54, 0x40, 255, 0x9d, 0xba, 0x98, 255, 0xfc, 0xff, 0xe7, 255]);
      // lightness in equal steps (OKLCH), not sRGB values
      assert(Math.abs(oklch(rgba, 12).l - (shadowL + baseL) / 2) < 0.01);
      assert(Math.abs(oklch(rgba, 16).l - (baseL + highlightL) / 2) < 0.01);
    })

    it('opaque style keeps chroma between colors of different hues', function () {
      // a blend in sRGB or OKLab passes close to gray between yellow and blue
      var colors = opaqueColors('#3c4f6e', '#fff4c8', '#9aa8a0');
      var rgba = internal.writeHillshadeRgba(Float32Array.from([-0.5]), null, 'opaque', colors);
      assert(oklch(rgba, 0).c > 0.03);
    })

    it('opaque style: tones beyond -1 and 1 get the end colors', function () {
      var colors = opaqueColors('#305440', '#fcffe7', '#9dba98');
      var rgba = internal.writeHillshadeRgba(Float32Array.from([-1.5, 1.5]), null, 'opaque', colors);
      assert.deepEqual(Array.from(rgba), [0x30, 0x54, 0x40, 255, 0xfc, 0xff, 0xe7, 255]);
    })

    it('opaque colors: given colors are used as they are', function () {
      var stops = rampColors('#305440', '#fcffe7', '#9dba98');
      assert.deepEqual([hex(stops.shadow), hex(stops.base), hex(stops.highlight)],
        ['#305440', '#9dba98', '#fcffe7']);
    })

    it('opaque colors: by default, the shadow is #686868, the base #d7d7d7 and the highlight white', function () {
      var stops = rampColors();
      assert.equal(hex(stops.shadow), '#686868');
      assert.equal(hex(stops.base), '#d7d7d7');
      assert.equal(hex(stops.highlight), '#ffffff');
    })

    it('opaque colors: a missing base is 80% of the lightness from shadow to highlight', function () {
      var stops = rampColors('#305440', '#fcffe7');
      var l = function(rgb) { return internal.rgbToOklab(rgb).l; };
      assert(Math.abs(l(stops.base) - (0.2 * l(stops.shadow) + 0.8 * l(stops.highlight))) < 0.005);
      assert.equal(hex(rampColors('#000000').base), hex(rampColors('#000000', '#ffffff').base));
    })

    it('opaque colors: a missing shadow has the base\'s hue, and the default colors\' ratio of lightness to the base', function () {
      var l = function(rgb) { return internal.rgbToOklab(rgb).l; };
      var ratio = l(internal.parseColor('#686868')) / l(internal.parseColor('#d7d7d7'));
      [['#e0d8c0', null], ['#c8dcc0', '#fcffe7'], ['#c8d8e8', '#fff8e0'], ['#808080', null]].forEach(function(pair) {
        var stops = rampColors(null, pair[1], pair[0]);
        var base = internal.oklabToOklch(internal.rgbToOklab(stops.base));
        var shadow = internal.oklabToOklch(internal.rgbToOklab(stops.shadow));
        assert(Math.abs(l(stops.shadow) / l(stops.base) - ratio) < 0.01, pair);
        if (base.c > 0.02) assert(Math.abs(shadow.h - base.h) < 3, pair);
      });
      assert.equal(hex(rampColors(null, null, '#d7d7d7').shadow), '#686868');
    })

    it('opaque colors: shadow and highlight strengths derive colors from the base', function () {
      var base = internal.parseColor('#e0d6c4');
      var l = function(rgb) { return internal.rgbToOklab(rgb).l; };
      assert.equal(hex(internal.getHillshadeShadowColor(base, 1)), hex(rampColors(null, null, '#e0d6c4').shadow));
      assert.equal(hex(internal.getHillshadeShadowColor(base, 0)), '#e0d6c4');
      assert(l(internal.getHillshadeShadowColor(base, 2)) < l(internal.getHillshadeShadowColor(base, 1)));
      assert.equal(hex(internal.getHillshadeHighlightColor(base, 1)), '#ffffff');
      assert.equal(hex(internal.getHillshadeHighlightColor(base, 0)), '#e0d6c4');
      [0.3, 1, 1.7].forEach(function(s) {
        var shadow = internal.getHillshadeShadowColor(base, s);
        assert(Math.abs(internal.getHillshadeShadowStrength(base, shadow) - s) < 0.02, s);
      });
      assert(Math.abs(internal.getHillshadeHighlightStrength(base, internal.getHillshadeHighlightColor(base, 0.4)) - 0.4) < 0.02);
    })

    it('opaque style: invalid pixels are clear', function () {
      var rgba = internal.renderHillshadeRgba(shade, valid, 'opaque', {gamma: 1, maxShade: 1 / 0.7},
        opaqueColors());
      assert.equal(rgba[3], 255);
      assert(oklch(rgba, 4).l < oklch(rgba, 0).l);
      assert(oklch(rgba, 8).l > oklch(rgba, 0).l);
      assert.deepEqual(Array.from(rgba.subarray(12, 16)), [0, 0, 0, 0]);
    })

    it('without base-color, flat ground is #d7d7d7, or 80% of the way from shadow to highlight, at the default altitude', async function () {
      function flatPixel(catalog) {
        return Array.from(catalog.getLayers()[0].layer.raster.grid.samples.subarray(0, 4));
      }
      var flat = function() { return makeElevationDataset(10, 10, function() { return 100; }); };
      var gray = flatPixel(await runOnDataset(flat(), '-hillshade opaque'));
      var base = rampColors('#305440', '#fcffe7').base;
      assert.deepEqual(gray, [215, 215, 215, 255]);
      assert(flatPixel(await runOnDataset(flat(), '-hillshade opaque altitude=20'))[0] < 215);
      assert(flatPixel(await runOnDataset(flat(), '-hillshade opaque altitude=70'))[0] > 215);
      assert.deepEqual(flatPixel(await runOnDataset(flat(), '-hillshade opaque shadow-color=#305440 highlight-color=#fcffe7')),
        [base.r, base.g, base.b, 255]);
    })
  })

  describe('featurePreservingSmooth()', function () {
    var w = 41, h = 30;
    // a sharp ridge along x = 20, with noise that is small relative to the ridge
    function noisyRidge(x, y) {
      var noise = ((x * 7919 + y * 104729) % 13) / 12 - 0.5;
      return 100 - 5 * Math.abs(x - 20) + noise;
    }
    function smooth(elev, valid) {
      return internal.featurePreservingSmooth(elev, valid, w, h,
        constantCells(h, 10), constantCells(h, 10), 1, {});
    }

    it('keeps a tilted plane, up to the edges', function () {
      var elev = makeElevation(w, h, function(x, y) { return 3 * x + 2 * y; });
      var out = smooth(elev, null);
      for (var i = 0; i < out.length; i++) {
        assert(Math.abs(out[i] - elev[i]) < 1e-3);
      }
    })

    it('leaves flat ground unchanged', function () {
      var elev = makeElevation(w, h, function() { return 250; });
      var out = smooth(elev, new Uint8Array(w * h).fill(1));
      assert(out.every(function(v) { return Math.abs(v - 250) < 1e-3; }));
    })

    it('removes noise but keeps the ridge crest sharp', function () {
      var elev = makeElevation(w, h, noisyRidge);
      var out = smooth(elev, new Uint8Array(w * h).fill(1));
      var before = 0, after = 0, n = 0;
      for (var y = 8; y < h - 8; y++) {
        for (var x = 8; x < w - 8; x++) {
          if (Math.abs(x - 20) < 2) continue;
          before += Math.abs(elev[y * w + x] - (100 - 5 * Math.abs(x - 20)));
          after += Math.abs(out[y * w + x] - (100 - 5 * Math.abs(x - 20)));
          n++;
        }
      }
      assert(after < before / 2, 'noise: ' + before / n + ' -> ' + after / n);
      assert(Math.abs(out[15 * w + 20] - 100) < 1.5, 'crest: ' + out[15 * w + 20]);
    })

    it('keeps nodata pixels unchanged', function () {
      var elev = makeElevation(w, h, noisyRidge);
      var valid = new Uint8Array(w * h).fill(1);
      elev[0] = -32768;
      valid[0] = 0;
      var out = smooth(elev, valid);
      assert.equal(out[0], -32768);
    })

    function totalChange(opts) {
      var elev = makeElevation(w, h, noisyRidge);
      var out = internal.featurePreservingSmooth(elev, new Uint8Array(w * h).fill(1), w, h,
        constantCells(h, 10), constantCells(h, 10), 1, opts);
      var max = 0, sum = 0;
      for (var i = 0; i < elev.length; i++) {
        max = Math.max(max, Math.abs(out[i] - elev[i]));
        sum += Math.abs(out[i] - elev[i]);
      }
      return {max: max, sum: sum};
    }

    it('maxChange limits how far elevations move', function () {
      assert(totalChange({}).max > 0.2);
      assert(totalChange({maxChange: 0.1}).max <= 0.1 + 1e-4);
    })

    it('a lower threshold smooths less', function () {
      assert(totalChange({threshold: 2}).sum < totalChange({threshold: 20}).sum * 0.8);
    })

    it('accepts a radius', function () {
      assert(totalChange({radius: 1}).sum > 0);
      assert.notEqual(totalChange({radius: 1}).sum, totalChange({radius: 6}).sum);
    })
  })

  describe('getSlopeThresholds()', function () {
    var w = 20, h = 12;
    var cells = constantCells(h, 10);
    function thresholds(fn, o, valid) {
      return internal.getSlopeThresholds(makeElevation(w, h, fn), valid || null, w, h, cells, cells, 1,
        Object.assign({min: 1, max: 20, slopeFactor: 3, slopeRadius: 0}, o));
    }

    it('flat terrain gets the minimum', function () {
      thresholds(function() { return 50; }).forEach(function(t) { assert.equal(t, 1); });
    })

    it('rises with slope, up to the maximum', function () {
      // a 10-degree slope
      var plane = function(x) { return x * 10 * Math.tan(10 * Math.PI / 180); };
      var t = thresholds(plane, {max: 40});
      assert(Math.abs(t[5 * w + 10] - 31) < 1e-3);
      assert.equal(thresholds(plane)[5 * w + 10], 20);
    })

    it('averages slope over slopeRadius', function () {
      // a single steep step: next to it, slope is averaged with flat ground
      var step = function(x) { return x < 10 ? 0 : 50; };
      var sharp = thresholds(step, {max: 90});
      var averaged = thresholds(step, {max: 90, slopeRadius: 3});
      assert(averaged[5 * w + 10] < sharp[5 * w + 10]);
      assert(averaged[5 * w + 6] > sharp[5 * w + 6]);
    })

    it('ignores pixels without data', function () {
      var valid = new Uint8Array(w * h);
      var t;
      for (var i = 0; i < valid.length; i++) valid[i] = i % w < 10 ? 0 : 1;
      t = thresholds(function(x) { return x < 10 ? -9999 : 50; }, {}, valid);
      assert.equal(t[5 * w + 10], 1);
    })
  })

  describe('dynamic FPS thresholds', function () {
    var w = 31, h = 21, c = 15;
    var cells = constantCells(h, 10);
    // a shallow V-shaped drainage, its sides about 3 degrees steep
    var elev = makeElevation(w, h, function(x, y) { return 0.5 * Math.abs(x - c) + 0.1 * y; });
    function depth(z) {
      var i = 10 * w + c;
      return (z[i - 3] + z[i + 3]) / 2 - z[i];
    }

    it('keep a shallow drainage that a fixed threshold rounds off', function () {
      var low = new Float32Array(w * h).fill(1);
      var fixed = internal.featurePreservingSmooth(elev, null, w, h, cells, cells, 1, {rounds: 3, threshold: 20});
      var dynamic = internal.featurePreservingSmooth(elev, null, w, h, cells, cells, 1,
        {rounds: 3, threshold: 20, thresholds: low});
      assert(depth(fixed) < depth(elev) * 0.9);
      assert(depth(dynamic) > depth(elev) * 0.99);
    })

    it('two-level smoothing of gentle terrain is single-level smoothing', function () {
      var low = new Float32Array(w * h).fill(1);
      var opts = {rounds: 3, threshold: 20, thresholds: low};
      var single = internal.featurePreservingSmooth(elev, null, w, h, cells, cells, 1, opts);
      var two = internal.twoLevelSmooth(elev, null, w, h, cells, cells, 1,
        Object.assign({blendRange: [5, 15]}, opts), {rounds: 1, threshold: 20});
      assert.deepEqual(Array.from(two), Array.from(single));
    })
  })

  describe('twoLevelSmooth()', function () {
    // odd dimensions, so the coarse grid has partial blocks
    var w = 41, h = 31;
    var cells = constantCells(h, 10);
    function smooth(elev, valid, opts) {
      return internal.twoLevelSmooth(elev, valid, w, h, cells, cells, 1,
        Object.assign({rounds: 3}, opts), {rounds: 1});
    }

    it('keeps a tilted plane, up to the edges', function () {
      var elev = makeElevation(w, h, function(x, y) { return 3 * x + 2 * y; });
      var out = smooth(elev, null);
      assert.equal(out.length, w * h);
      for (var i = 0; i < out.length; i++) {
        assert(Math.abs(out[i] - elev[i]) < 0.01);
      }
    })

    it('removes steep one-pixel spikes, which full-resolution FPS keeps as features', function () {
      function spikes(x, y) { return 2 * x + y + (x % 5 == 2 && y % 5 == 2 ? 30 : 0); }
      // deviation of slopes from the plane's
      function roughness(z) {
        var sum = 0, i;
        for (var y = 3; y < h - 3; y++) {
          for (var x = 3; x < w - 3; x++) {
            i = y * w + x;
            sum += Math.abs(z[i + 1] - z[i - 1] - 4) + Math.abs(z[i + w] - z[i - w] - 2);
          }
        }
        return sum;
      }
      var elev = makeElevation(w, h, spikes);
      var one = internal.featurePreservingSmooth(elev, null, w, h, cells, cells, 1, {rounds: 3});
      var two = smooth(elev, null);
      assert(roughness(one) > roughness(elev) * 0.9);
      assert(roughness(two) < roughness(elev) * 0.1);
    })

    it('leaves pixels without data unchanged, and applies maxChange to the result', function () {
      var elev = makeElevation(w, h, function(x, y) { return x < 10 ? -9999 : 100 + ((x * 7 + y * 3) % 5) * 4; });
      var valid = new Uint8Array(w * h);
      for (var i = 0; i < valid.length; i++) valid[i] = elev[i] > -9999 ? 1 : 0;
      var out = smooth(elev, valid, {maxChange: 0.5});
      for (i = 0; i < out.length; i++) {
        if (!valid[i]) assert.equal(out[i], -9999);
        else assert(Math.abs(out[i] - elev[i]) <= 0.5 + 1e-4);
      }
    })
  })

  describe('computeLightAdjustment()', function () {
    var w = 60, h = 60;
    function adjustment(fn, azimuth) {
      var elev = makeElevation(w, h, fn);
      var offsets = internal.computeLightAdjustment(elev, new Uint8Array(w * h).fill(1), w, h,
        azimuth, 45, 6);
      return offsets[30 * w + 30] * 180 / Math.PI;
    }

    it('turns a NW light toward the west on north-south ridges', function () {
      var deg = adjustment(function(x) { return 100 * Math.sin(x / 4); }, 315);
      assert(Math.abs(deg + 45) < 1e-3, String(deg));
    })

    it('turns a NW light toward the north on east-west ridges', function () {
      var deg = adjustment(function(x, y) { return 100 * Math.sin(y / 4); }, 315);
      assert(Math.abs(deg - 45) < 1e-3, String(deg));
    })

    it('does not adjust light that already crosses the ridges', function () {
      var deg = adjustment(function(x, y) { return 100 * Math.sin((x - y) / 4); }, 315);
      assert(Math.abs(deg) < 1e-3, String(deg));
    })

    it('does not adjust light on flat ground', function () {
      assert.equal(adjustment(function() { return 10; }, 315), 0);
    })
  })

  describe('computeOpenness()', function () {
    it('is 1 on flat ground and lower in a valley', function () {
      var w = 41, h = 41;
      var elev = makeElevation(w, h, function(x) { return Math.abs(x - 20) * 20; });
      var flat = makeElevation(w, h, function() { return 0; });
      var valid = new Uint8Array(w * h).fill(1);
      var cells = constantCells(h, 10);
      var open = internal.computeOpenness(flat, valid, w, h, cells, cells, 1, 10);
      assert(Math.abs(open[20 * w + 20] - 1) < 1e-6);
      open = internal.computeOpenness(elev, valid, w, h, cells, cells, 1, 10);
      assert(open[20 * w + 20] < 0.6);
      assert(open[20 * w + 20] < open[20 * w + 30]);
    })
  })

  describe('computeTextureShading()', function () {
    it('is positive on ridges, negative in valleys and zero on a plane', function () {
      var w = 61, h = 61;
      var cells = constantCells(h, 10);
      var ridge = makeElevation(w, h, function(x) { return 500 - Math.abs(x - 30) * 10; });
      var plane = makeElevation(w, h, function(x, y) { return x * 3 + y * 2; });
      var valley = makeElevation(w, h, function(x) { return Math.abs(x - 30) * 10; });
      var at = function(elev, x) {
        return internal.computeTextureShading(elev, null, w, h, cells, 1, 0.5, 4)[30 * w + x];
      };
      assert(at(ridge, 30) > 0.1);
      assert(at(valley, 30) < -0.1);
      assert(Math.abs(at(plane, 30)) < 1e-3);
      assert(Math.abs(at(ridge, 15)) < 1e-3); // a uniform slope, away from the crest
    })
  })

  describe('applyTextureTones()', function () {
    it('darkens drainages up to its opacity and leaves ridges alone', function () {
      var a = 0.5 * Math.tanh(1);
      // flat ground, shadow, full shadow, highlight, ridge
      var tones = new Float32Array([0, -0.4, -1, 0.3, 0.3]);
      internal.applyTextureTones(tones, new Float32Array([-1, -1, -1, -1, 2]), null, 0.5);
      assert.deepEqual(Array.from(tones).map(function(v) { return +v.toFixed(4); }),
        [-a, -(1 - 0.6 * (1 - a)), -1, 0.3 - a, 0.3].map(function(v) { return +v.toFixed(4); }));
    })

    it('lightens ridges up to the highlight opacity', function () {
      var h = 0.4 * Math.tanh(1);
      // flat ground, highlight, shadow, drainage
      var tones = new Float32Array([0, 0.5, -0.3, 0]);
      internal.applyTextureTones(tones, new Float32Array([1, 1, 1, -1]), null, 0.5, 0.4);
      assert.deepEqual(Array.from(tones).map(function(v) { return +v.toFixed(4); }),
        [h, 0.5 + h * 0.5, -0.3 + h, -0.5 * Math.tanh(1)].map(function(v) { return +v.toFixed(4); }));
    })
  })

  describe('applyAmbientTones()', function () {
    it('darkens tones where the sky is hidden, and leaves open ground alone', function () {
      // weight 0.5 and max opacity 0.5 give a shadow layer of opacity 0.5 * (1 - openness)
      var tones = new Float32Array([-0.2, 0.3, 0.3, -0.4, -0.1]);
      internal.applyAmbientTones(tones, new Float32Array([1, 1, 0.5, 0.5, 1.2]), null, 0.5, 0.5);
      // the highlight at 0.3 takes 1.8 * 0.25, which overruns it by 0.15 (0.083 as a shadow)
      assert.deepEqual(Array.from(tones).map(function(v) { return +v.toFixed(3); }),
        [-0.2, 0.3, -0.083, -0.55, 0]);
    })

    it('darkens highlights 1.8 times as much as flat ground, leaving bright ones a highlight', function () {
      var tones = new Float32Array([0.4, 0]);
      internal.applyAmbientTones(tones, new Float32Array([0.8, 0.8]), null, 0.5, 0.55);
      assert.deepEqual(Array.from(tones).map(function(v) { return +v.toFixed(3); }), [0.202, -0.11]);
    })
  })

  describe('removeThinHighlights()', function () {
    function grid(rows) {
      return Float32Array.from([].concat.apply([], rows));
    }
    function rows(tones, w) {
      var out = [];
      for (var i = 0; i < tones.length; i += w) {
        out.push(Array.from(tones.subarray(i, i + w)).map(function(v) { return +v.toFixed(4); }));
      }
      return out;
    }

    it('lowers bright lines one pixel wide, in any direction, to their brighter side', function () {
      var vertical = grid([
        [0.1, 0.5, -0.2, -0.2],
        [0.1, 0.5, -0.2, -0.2],
        [0.1, 0.5, -0.2, -0.2]]);
      var diagonal = grid([
        [0.5, 0, 0, 0, 0],
        [0, 0.5, 0, 0, 0],
        [0, 0, 0.5, 0, 0],
        [0, 0, 0, 0.5, 0],
        [0, 0, 0, 0, 0]]);
      assert.deepEqual(rows(internal.removeThinHighlights(vertical, null, 4, 3), 4), [
        [0.1, 0.1, -0.2, -0.2],
        [0.1, 0.1, -0.2, -0.2],
        [0.1, 0.1, -0.2, -0.2]]);
      assert(Array.from(internal.removeThinHighlights(diagonal, null, 5, 5)).every(function(v) { return v === 0; }));
    })

    it('leaves features two pixels wide, edges and dark lines unchanged', function () {
      var tones = grid([
        [0, 0.5, 0.5, 0, -0.5, 0, 0.3, 0.3],
        [0, 0.5, 0.5, 0, -0.5, 0, 0.3, 0.3],
        [0, 0.5, 0.5, 0, -0.5, 0, 0.3, 0.3]]);
      var before = Array.from(tones);
      assert.deepEqual(Array.from(internal.removeThinHighlights(tones, null, 8, 3)), before);
    })

    it('ignores invalid pixels, as it does pixels outside the grid', function () {
      var tones = grid([
        [-1, 0.5, 0.4],
        [-1, 0.5, 0.4]]);
      var valid = new Uint8Array([0, 1, 1, 0, 1, 1]);
      var before = Array.from(tones);
      assert.deepEqual(Array.from(internal.removeThinHighlights(tones, valid, 3, 2)), before);
    })
  })

  describe('applyAerialPerspective()', function () {
    it('reduces contrast at low elevations only', function () {
      var n = 200;
      var elev = new Float32Array(n), shade = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        elev[i] = i * 10;
        shade[i] = 0.5;
      }
      internal.applyAerialPerspective(shade, elev, null, 1);
      assert(Math.abs(shade[0] - 1) < 0.01);
      assert(Math.abs(shade[n - 1] - 0.5) < 0.01);
      assert(shade[100] > 0.6 && shade[100] < 0.9);
    })
  })

  describe('getHillshadeCellSizes()', function () {
    it('lat-long pixels narrow toward the poles', function () {
      var grid = {width: 2, height: 2, bbox: [0, 59, 2, 61]};
      var cells = internal.getHillshadeCellSizes(grid, internal.parseCrsString('wgs84'));
      var degree = 6371008.8 * Math.PI / 180;
      assert(Math.abs(cells.heights[0] - degree) < 1);
      assert(Math.abs(cells.widths[0] - degree * Math.cos(60.5 * Math.PI / 180)) < 1);
      assert(cells.widths[0] < cells.widths[1]);
    })

    it('projected pixels are corrected by the scale factor', function () {
      var crs = internal.parseCrsString('webmercator');
      var y60 = 8399737.89; // 60 degrees north
      var grid = {width: 10, height: 1, bbox: [0, y60 - 500, 10000, y60 + 500]};
      var cells = internal.getHillshadeCellSizes(grid, crs);
      assert(Math.abs(cells.widths[0] - 500) < 2);
    })
  })

  describe('-hillshade command', function () {
    function slope(x, y) { return (x + y) * 20; }

    it('replaces the elevation layer, keeping its name', async function () {
      var catalog = await runOnDataset(makeElevationDataset(20, 20, slope), '-hillshade');
      var layers = catalog.getLayers();
      var grid;
      assert.equal(layers.length, 1);
      assert.equal(layers[0].layer.name, 'dem');
      grid = layers[0].layer.raster.grid;
      assert.equal(grid.bands, 4);
      assert.equal(grid.pixelType, 'uint8');
      assert.equal(grid.width, 20);
      assert.equal(layers[0].layer.raster.interpretation, 'image');
      assert.equal(layers[0].layer.raster.derivation.type, 'hillshade');
      assert.equal(layers[0].layer.raster.derivation.azimuth, 315);
    })

    it('+ keeps the elevation layer and adds a layer named "hillshade"', async function () {
      var catalog = await runOnDataset(makeElevationDataset(20, 20, slope), '-hillshade +');
      var names = catalog.getLayers().map(function(o) { return o.layer.name; });
      assert.deepEqual(names.sort(), ['dem', 'hillshade']);
    })

    it('name= names the output layer', async function () {
      var catalog = await runOnDataset(makeElevationDataset(20, 20, slope), '-hillshade + name=relief');
      assert(catalog.getLayers().some(function(o) { return o.layer.name == 'relief'; }));
    })

    it('converts elevations in feet to meters', async function () {
      var ft = makeElevationDataset(20, 20, slope);
      var m = makeElevationDataset(20, 20, function(x, y) { return slope(x, y) * 0.3048; });
      var unconverted = makeElevationDataset(20, 20, slope);
      var cmd = '-hillshade opaque min-elevation=200';
      ft.layers[0].raster.grid.verticalUnits = 'ft';
      m.layers[0].raster.grid.verticalUnits = 'm';
      function samples(catalog) {
        return Array.from(catalog.getLayers()[0].layer.raster.grid.samples);
      }
      var ftOut = samples(await runOnDataset(ft, cmd));
      // min-elevation= is in the raster's units
      assert.deepEqual(ftOut, samples(await runOnDataset(m, '-hillshade opaque min-elevation=' + 200 * 0.3048)));
      assert.notDeepEqual(ftOut, samples(await runOnDataset(unconverted, cmd)));
    })

    it('getFittedVerticalScale() scales the median slope to a typical steepness', function () {
      var w = 10, h = 10;
      var elev = makeElevation(w, h, function(x) { return x * 50; });
      var scale = internal.getFittedVerticalScale(elev, null, w, h, constantCells(h, 1), constantCells(h, 1));
      assert(Math.abs(Math.atan(50 * scale) * 180 / Math.PI - internal.FITTED_MEDIAN_SLOPE) < 1e-9);
      assert.equal(internal.getFittedVerticalScale(new Float32Array(w * h), null, w, h,
        constantCells(h, 1), constantCells(h, 1)), 1);
    })

    // e.g. a DEM saved from an image editor, its values stretched to the pixel type's range
    describe('a DEM in pixel coordinates', function () {
      function bumps(x, y) { return 40 * Math.sin(x / 3) * Math.cos(y / 4) + x * 5; }
      function pixelDem(fn) {
        var dataset = makeElevationDataset(20, 20, fn);
        var grid = dataset.layers[0].raster.grid;
        dataset.info = {};
        grid.bbox = [0, 0, 20, 20];
        grid.transform = [1, 0, 0, 0, -1, 20];
        grid.pixelCoordinates = true;
        return dataset;
      }
      function samples(catalog) {
        return catalog.getLayers()[0].layer.raster.grid.samples;
      }

      it('is shaded the same however its values are stretched', async function () {
        var a = samples(await runOnDataset(pixelDem(bumps), '-hillshade opaque'));
        var b = samples(await runOnDataset(pixelDem(function(x, y) { return bumps(x, y) * 1000; }),
          '-hillshade opaque'));
        assert(new Set(a).size > 10);
        for (var i = 0; i < a.length; i++) {
          assert(Math.abs(a[i] - b[i]) <= 1, 'pixel ' + i);
        }
      })

      it('is shaded to scale given the ground size of a pixel', async function () {
        var scaled = pixelDem(bumps);
        var meters = pixelDem(bumps);
        scaled.layers[0].raster.grid.horizontalUnitMeters = 30;
        // the same DEM with its coordinates in meters (and no CRS)
        delete meters.layers[0].raster.grid.pixelCoordinates;
        meters.layers[0].raster.grid.bbox = [0, 0, 600, 600];
        assert.deepEqual(samples(await runOnDataset(scaled, '-hillshade opaque')),
          samples(await runOnDataset(meters, '-hillshade opaque')));
      })
    })

    it('nodata pixels are transparent', async function () {
      var dataset = makeElevationDataset(10, 10, function(x, y) { return y < 2 ? -9999 : slope(x, y); },
        {nodata: -9999});
      var catalog = await runOnDataset(dataset, '-hillshade opaque');
      var samples = catalog.getLayers()[0].layer.raster.grid.samples;
      assert.equal(samples[3], 0);
      assert.equal(samples[(5 * 10 + 5) * 4 + 3], 255);
    })

    it('flat ground is clear in shadow style', async function () {
      var catalog = await runOnDataset(makeElevationDataset(10, 10, function() { return 100; }), '-hillshade');
      var samples = catalog.getLayers()[0].layer.raster.grid.samples;
      for (var i = 3; i < samples.length; i += 4) {
        assert.equal(samples[i], 0);
      }
    })

    it('min-elevation=0 flattens the sea floor, including near the coast', async function () {
      // sea floor deepening eastward (facing away from the light), then land
      function coast(x) { return x < 10 ? -100 - x * 100 : 200 + (x - 10) * 10; }
      function seaAlpha(catalog) {
        var samples = catalog.getLayers()[0].layer.raster.grid.samples;
        var max = 0;
        for (var y = 0; y < 20; y++) {
          for (var x = 0; x < 9; x++) {
            max = Math.max(max, samples[(y * 20 + x) * 4 + 3]);
          }
        }
        return max;
      }
      var plain = await runOnDataset(makeElevationDataset(20, 20, coast), '-hillshade smoothing=off');
      var flattened = await runOnDataset(makeElevationDataset(20, 20, coast), '-hillshade min-elevation=0');
      var textured = await runOnDataset(makeElevationDataset(20, 20, coast), '-hillshade min-elevation=0 texture=1');
      assert(seaAlpha(plain) > 0);
      assert.equal(seaAlpha(flattened), 0);
      assert.equal(seaAlpha(textured), 0);
      assert.equal(flattened.getLayers()[0].layer.raster.derivation.min_elevation, 0);
    })

    it('raiseLowElevations() and restoreLowElevations()', function () {
      var elev = Float32Array.from([-5, 3, -2, 10]);
      var valid = Uint8Array.from([1, 1, 0, 1]);
      var raised = internal.raiseLowElevations(elev, valid, 0);
      assert.deepEqual(Array.from(elev), [0, 3, -2, 10]);
      assert.deepEqual(Array.from(raised), [1, 0, 0, 0]);
      var before = Float32Array.from(elev);
      elev.set([1.5, -0.5, -2, 9]);
      internal.restoreLowElevations(elev, before, valid, 0);
      // sea reset; land sinks at most halfway to the minimum
      assert.deepEqual(Array.from(elev), [0, 1.5, -2, 9]);
    })

    it('rejects out-of-range max-opacity= and gamma=', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade max-opacity=2'), /max-opacity/);
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade gamma=0'), /gamma/);
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade workers=-1'), /workers/);
    })

    describe('workers=', function () {
      this.timeout(20000);
      function ridges(x, y) {
        return 300 * Math.sin(x / 9) * Math.cos(y / 13) + 80 * Math.sin((x * 3 + y) / 4) - 60;
      }
      async function hillshadeSamples(options) {
        var catalog = await runOnDataset(makeElevationDataset(240, 180, ridges), '-hillshade ' + options);
        return Buffer.from(catalog.getLayers()[0].layer.raster.grid.samples);
      }

      ['', 'smoothing=3 texture=0.5 aerial=0.4 min-elevation=0',
        'smoothing=4 light-adjust=20 lighting=hard opaque'].forEach(function(options) {
        it('workers give the same output as the main thread: ' + (options || 'defaults'), async function () {
          var main = await hillshadeSamples(options + ' workers=0');
          var workers = await hillshadeSamples(options + ' workers=3');
          assert(main.equals(workers));
        });
      });

      it('starts workers (the tests above would pass in the main thread too)', async function () {
        var w = 200, h = 150;
        var r = await internal.runHillshadeStages({
          elev: makeElevation(w, h, ridges),
          valid: null,
          width: w,
          height: h,
          cellWidths: constantCells(h, 100),
          cellHeights: constantCells(h, 100)
        }, null, {lights: internal.getHillshadeLights(315, 45), exaggeration: 1, style: 'shadow',
          toneOpts: {}}, {workers: 2});
        assert.equal(r.workers, 2);
        assert.equal(r.tones.length, w * h);
      });

      it('is not recorded in the derivation', async function () {
        var catalog = await runOnDataset(makeElevationDataset(20, 20, slope), '-hillshade workers=2');
        assert(!('workers' in catalog.getLayers()[0].layer.raster.derivation));
      });

      it('automatic: none for small rasters', function () {
        assert.equal(internal.getHillshadeWorkerCount(null, 1000), 0);
        assert.equal(internal.getHillshadeWorkerCount(2, 1000), 2);
        assert.equal(internal.getHillshadeWorkerCount(0, 1e8), 0);
      });
    });

    it('records lighting and smoothing options in the derivation', async function () {
      var catalog = await runOnDataset(makeElevationDataset(30, 30, function(x, y) {
        return 50 * Math.sin(x / 3) + y * 5;
      }), '-hillshade light-adjust=30 ambient=0.3 texture=0.4 aerial=0.5 smoothing=3');
      var d = catalog.getLayers()[0].layer.raster.derivation;
      assert.equal(d.light_adjust, 30);
      assert.equal(d.ambient, 0.3);
      assert.equal(d.texture, 0.4);
      assert.equal(d.texture_detail, 0.5);
      assert.equal(d.aerial, 0.5);
      assert.strictEqual(d.smoothing, 3);
    })

    it('texture= sets the opacity of drainage shading, independently of max-opacity=', async function () {
      var w = 41;
      function valley(x) { return Math.abs(x - 20) * 20; }
      function alphaAt(catalog) {
        return catalog.getLayers()[0].layer.raster.grid.samples[(20 * w + 20) * 4 + 3];
      }
      var none = await runOnDataset(makeElevationDataset(w, 41, valley), '-hillshade max-opacity=0');
      var light = await runOnDataset(makeElevationDataset(w, 41, valley), '-hillshade max-opacity=0 texture=0.5');
      var strong = await runOnDataset(makeElevationDataset(w, 41, valley), '-hillshade max-opacity=0 texture=1');
      assert.equal(alphaAt(none), 0);
      assert(alphaAt(light) > 0);
      assert(alphaAt(light) <= 128);
      assert(Math.abs(alphaAt(strong) - 2 * alphaAt(light)) <= 1);
    })

    it('texture-highlights= lightens ridges, relative to texture=', async function () {
      var w = 41;
      function ridge(x) { return 1000 - Math.abs(x - 20) * 20; }
      function pixelAt(catalog) {
        var s = catalog.getLayers()[0].layer.raster.grid.samples, j = (20 * w + 20) * 4;
        return [s[j], s[j + 3]];
      }
      var dark = await runOnDataset(makeElevationDataset(w, 41, ridge), '-hillshade max-opacity=0 texture=0.5');
      var lit = await runOnDataset(makeElevationDataset(w, 41, ridge),
        '-hillshade max-opacity=0 texture=0.5 texture-highlights=1');
      assert.equal(pixelAt(dark)[1], 0);
      assert.equal(pixelAt(lit)[0], 255);
      assert(pixelAt(lit)[1] > 0 && pixelAt(lit)[1] <= 128);
      assert.equal(lit.getLayers()[0].layer.raster.derivation.texture_highlights, 1);
    })

    it('rejects out-of-range lighting options and unknown smoothing methods', async function () {
      var dem = function() { return makeElevationDataset(5, 5, slope); };
      await assert.rejects(runOnDataset(dem(), '-hillshade light-adjust=90'), /light-adjust/);
      await assert.rejects(runOnDataset(dem(), '-hillshade ambient=2'), /ambient/);
      await assert.rejects(runOnDataset(dem(), '-hillshade texture=2'), /texture/);
      await assert.rejects(runOnDataset(dem(), '-hillshade texture=0.5 texture-detail=3'), /texture-detail/);
      await assert.rejects(runOnDataset(dem(), '-hillshade texture=0.5 texture-highlights=-1'), /texture-highlights/);
      await assert.rejects(runOnDataset(dem(), '-hillshade texture-highlights=1'), /require texture/);
      await assert.rejects(runOnDataset(dem(), '-hillshade aerial=-1'), /aerial/);
      await assert.rejects(runOnDataset(dem(), '-hillshade smoothing=bogus'), /smoothing/);
    })

    it('FPS settings are -smooth-terrain options, not -hillshade options', async function () {
      var dem = function() { return makeElevationDataset(20, 20, slope); };
      for (var opt of ['fps-threshold=10', 'fps-radius=2', 'fps-passes=2', 'fps-levels=2', 'maximum-change=50']) {
        await assert.rejects(runOnDataset(dem(), '-hillshade ' + opt), new RegExp(opt.split('=')[0]), opt);
      }
    })

    describe('smoothing=', function () {
      var dem = function() {
        return makeElevationDataset(20, 20, function(x, y) { return 50 * Math.sin(x / 2) + y * 5; });
      };
      async function getDerivation(cmd) {
        var catalog = await runOnDataset(dem(), cmd);
        return catalog.getLayers()[0].layer.raster.derivation;
      }
      function getAlpha(catalog) {
        return Array.from(catalog.getLayers()[0].layer.raster.grid.samples).filter(function(v, i) {
          return i % 4 == 3;
        });
      }

      it('the default is no smoothing', async function () {
        var d = await getDerivation('-hillshade');
        assert.strictEqual(d.smoothing, 0);
        assert.deepEqual(getAlpha(await runOnDataset(dem(), '-hillshade')),
          getAlpha(await runOnDataset(dem(), '-hillshade smoothing=0')));
      })

      it('smoothing uses the automatic exaggeration, whatever exaggeration= is', async function () {
        // pixels are about 111 m, so the automatic exaggeration is 1.5
        var src = dem(), grid = src.layers[0].raster.grid;
        var cells = internal.getHillshadeCellSizes(grid, internal.getDatasetCRS(src));
        var smoothed = internal.smoothTerrain({elev: Float32Array.from(grid.samples), valid: null,
          width: 20, height: 20, cellWidths: cells.widths, cellHeights: cells.heights},
          internal.getSmoothingSettings(2, {}, cells.median, null)).elev;
        var presmoothed = makeElevationDataset(20, 20, function(x, y) { return smoothed[y * 20 + x]; });
        assert.deepEqual(getAlpha(await runOnDataset(dem(), '-hillshade smoothing=2 exaggeration=3')),
          getAlpha(await runOnDataset(presmoothed, '-hillshade smoothing=0 exaggeration=3')));
      })

      it('-smooth-terrain then -hillshade is the same as smoothing=', async function () {
        assert.deepEqual(getAlpha(await runOnDataset(dem(), '-smooth-terrain 2 -hillshade')),
          getAlpha(await runOnDataset(dem(), '-hillshade smoothing=2')));
      })

      describe('generalization of landforms of different sizes', function () {
        var size = 64, border = 8;
        // position along a direction, in pixels
        function along(x, y, deg) {
          var a = deg * Math.PI / 180;
          return x * Math.cos(a) + y * Math.sin(a);
        }
        // Pixels are about 111 m. Sharp-crested ridges 40 pixels apart and 300 m
        // high; spurs 12 pixels apart, whose faces differ by about 22 degrees
        // (exaggerated), between the thresholds of levels 3 and 4; gullies and
        // hummocks 5-6 pixels apart; and pixel-scale noise
        var ridges = [20, 40], spurs = [110, 12], small = [[65, 5], [160, 6]];
        function terrain(x, y) {
          return 300 * (1 - Math.abs(Math.sin(Math.PI * along(x, y, ridges[0]) / ridges[1]))) +
            28 * Math.sin(2 * Math.PI * along(x, y, spurs[0]) / spurs[1] + 0.5) +
            8 * Math.sin(2 * Math.PI * along(x, y, small[0][0]) / small[0][1] + 1.3) +
            6 * Math.sin(2 * Math.PI * along(x, y, small[1][0]) / small[1][1] + 2.1) +
            4 * (((x * 7919 + y * 104729) % 13) / 12 - 0.5);
        }
        // Amplitude of a wave in the shading's gray values, away from the edges
        function waveAmplitude(catalog, wave) {
          var samples = catalog.getLayers()[0].layer.raster.grid.samples;
          var c = 0, s = 0, n = 0, x, y, t, v;
          for (y = border; y < size - border; y++) {
            for (x = border; x < size - border; x++) {
              t = 2 * Math.PI * along(x, y, wave[0]) / wave[1];
              v = samples[(y * size + x) * 4 + 1];
              c += v * Math.cos(t);
              s += v * Math.sin(t);
              n++;
            }
          }
          return 2 * Math.sqrt(c * c + s * s) / n;
        }
        var levels;

        before(async function () {
          levels = [];
          for (var level = 0; level <= 4; level++) {
            var catalog = await runOnDataset(makeElevationDataset(size, size, terrain),
              '-hillshade opaque smoothing=' + level);
            levels.push({
              ridges: waveAmplitude(catalog, ridges),
              spurs: waveAmplitude(catalog, spurs),
              small: waveAmplitude(catalog, small[0]) + waveAmplitude(catalog, small[1])
            });
          }
        });

        function share(key) {
          return levels.map(function(o) { return +(o[key] / levels[0][key]).toFixed(2); });
        }

        it('each level removes more of the small landforms', function () {
          var shares = share('small');
          for (var i = 1; i < shares.length; i++) {
            assert(shares[i] < 0.8 * shares[i - 1], shares.join(', '));
          }
        })

        it('levels 1-3 keep mid-sized landforms, and level 4 removes much of them', function () {
          var shares = share('spurs');
          assert(shares[1] > 0.9 && shares[2] > 0.9 && shares[3] > 0.9, shares.join(', '));
          assert(shares[4] < 0.75, shares.join(', '));
        })

        it('every level keeps sharp ridges', function () {
          var shares = share('ridges');
          assert(shares.every(function(v) { return v > 0.9; }), shares.join(', '));
        })
      })

      it('pasting the printed settings reproduces the result', async function () {
        var cmd = '-hillshade smoothing=3 highlight-color=#fff0b4';
        var first = await runOnDataset(dem(), cmd);
        var settings = internal.formatHillshadeSettings(first.getLayers()[0].layer.raster.derivation);
        var second = await runOnDataset(dem(), '-hillshade ' + settings);
        assert.deepEqual(getAlpha(second), getAlpha(first));
        assert.deepEqual(Array.from(second.getLayers()[0].layer.raster.grid.samples),
          Array.from(first.getLayers()[0].layer.raster.grid.samples));
      })

      it('0 and off skip smoothing', async function () {
        var off = await runOnDataset(dem(), '-hillshade smoothing=off');
        var zero = await runOnDataset(dem(), '-hillshade smoothing=0');
        var d = off.getLayers()[0].layer.raster.derivation;
        assert.strictEqual(d.smoothing, 0);
        assert.deepEqual(getAlpha(off), getAlpha(zero));
        assert.notDeepEqual(getAlpha(off), getAlpha(await runOnDataset(dem(), '-hillshade smoothing=1')));
      })

      it('rejects other smoothing values', async function () {
        for (var val of ['5', '-1', '1.5', 'low', 'high', 'auto', 'lowpass']) {
          await assert.rejects(runOnDataset(dem(), '-hillshade smoothing=' + val), /smoothing=/, val);
        }
        await assert.rejects(runOnDataset(dem(), '-hillshade lowpass-radius=2'), /lowpass-radius/);
      })

      it('generalize= is no longer an option', async function () {
        await assert.rejects(runOnDataset(dem(), '-hillshade generalize=2'), /generalize/);
      })
    })

    describe('-smooth-terrain', function () {
      var dem = function() {
        return makeElevationDataset(20, 20, function(x, y) { return 50 * Math.sin(x / 2) + y * 5; });
      };
      async function getLayer(cmd, ds) {
        return (await runOnDataset(ds || dem(), cmd)).getLayers()[0].layer;
      }
      async function getSettings(cmd) {
        return (await getLayer(cmd)).raster.derivation.terrain_smoothing;
      }
      async function getElevation(cmd, ds) {
        return Array.from((await getLayer(cmd, ds)).raster.grid.samples);
      }
      function presetSettings(d) {
        return [d.fps_passes, d.fps_threshold, d.fps_radius, d.fps_levels, d.fps_min_threshold,
          d.fps_slope_factor, d.fps_slope_radius];
      }

      it('smooths like -hillshade smoothing=, into a float32 elevation layer', async function () {
        var lyr = await getLayer('-smooth-terrain 2');
        var src = dem().layers[0].raster.grid.samples;
        assert.equal(lyr.name, 'dem');
        assert.equal(lyr.raster.grid.pixelType, 'float32');
        assert(lyr.raster.grid.samples instanceof Float32Array);
        assert.notDeepEqual(Array.from(lyr.raster.grid.samples), Array.from(src));
        assert.strictEqual(lyr.raster.interpretation, 'continuous');
        assert.equal(lyr.raster.derivation.type, 'gray');
      })

      it('+ keeps the original layer', async function () {
        var catalog = await runOnDataset(dem(), '-smooth-terrain + name=smoothed');
        assert.deepEqual(catalog.getLayers().map(function(o) { return o.layer.name; }), ['dem', 'smoothed']);
      })

      it('the default is level 1: one pass of dynamic FPS', async function () {
        var d = await getSettings('-smooth-terrain');
        assert.strictEqual(d.level, 1);
        assert.deepEqual(presetSettings(d), [1, 10, 3, 1, 1, 0.6, 10]);
        assert.deepEqual(await getElevation('-smooth-terrain'), await getElevation('-smooth-terrain 1'));
      })

      it('levels set FPS passes, thresholds, radius and slope factor', async function () {
        assert.deepEqual(presetSettings(await getSettings('-smooth-terrain 2')), [2, 15, 4, 1, 1, 1, 10]);
        assert.deepEqual(presetSettings(await getSettings('-smooth-terrain level=3')), [3, 20, 6, 1, 1, 1.4, 10]);
        assert.deepEqual(presetSettings(await getSettings('-smooth-terrain 4')), [3, 25, 8, 1, 1, 1.9, 10]);
      })

      it('rejects levels other than 1-4', async function () {
        for (var val of ['0', 'off', '5', '1.5', 'high']) {
          await assert.rejects(runOnDataset(dem(), '-smooth-terrain ' + val), /smoothing level/, val);
        }
      })

      it('rejects color images, but not a DEM imported as an image', async function () {
        await api.applyCommands('-i test/data/geotiff/sedona-elev.tif -smooth-terrain');
        await assert.rejects(api.applyCommands('-i test/data/geotiff/sedona-naip.tif -smooth-terrain'),
          /elevation raster/);
      })

      it('min-elevation= leaves terrain below it unchanged', async function () {
        function coast(x) { return x < 10 ? -100 - x * 100 : 200 + (x - 10) * 10 + 30 * Math.sin(x); }
        var ds = function() { return makeElevationDataset(20, 20, coast); };
        var src = Array.from(ds().layers[0].raster.grid.samples);
        var out = await getElevation('-smooth-terrain 3 min-elevation=0', ds());
        out.forEach(function(v, i) {
          if (src[i] < 0) assert.equal(v, src[i]);
        });
        assert.notDeepEqual(out, src);
        assert.strictEqual((await getLayer('-smooth-terrain min-elevation=0', ds())).raster.derivation.terrain_smoothing.min_elevation, 0);
      })

      it('FPS settings override the level', async function () {
        var d = await getSettings('-smooth-terrain 3 fps-passes=2 fps-threshold=25');
        assert.strictEqual(d.level, 3);
        assert.deepEqual(presetSettings(d), [2, 25, 6, 1, 1, 1.4, 10]);
        assert.deepEqual(await getElevation('-smooth-terrain fps-passes=2 fps-threshold=15 fps-radius=4 fps-slope-factor=1'),
          await getElevation('-smooth-terrain 2'));
      })

      it('accepts FPS settings and rejects out-of-range values', async function () {
        var d = await getSettings('-smooth-terrain fps-threshold=10 fps-radius=2 maximum-change=50');
        assert.equal(d.fps_threshold, 10);
        assert.equal(d.fps_radius, 2);
        assert.equal(d.maximum_change, 50);
        for (var opt of ['fps-threshold=90', 'fps-threshold=0', 'fps-radius=0', 'maximum-change=-5',
            'fps-passes=0', 'fps-levels=3', 'workers=-1']) {
          await assert.rejects(runOnDataset(dem(), '-smooth-terrain ' + opt), new RegExp(opt.split('=')[0]), opt);
        }
      })

      it('fps-levels=2 turns on two-level smoothing', async function () {
        var d = await getSettings('-smooth-terrain 3 fps-levels=2');
        assert.equal(d.fps_levels, 2);
        assert.equal(d.fps_blend, '5,15');
        assert.notDeepEqual(await getElevation('-smooth-terrain 3 fps-levels=2'), await getElevation('-smooth-terrain 3'));
      })

      it('dynamic smoothing changes gentle terrain more than steep terrain', async function () {
        var gentle = function() {
          return makeElevationDataset(20, 20, function(x, y) { return 2 * Math.sin(x / 2) + y * 0.5; });
        };
        var steep = function() {
          return makeElevationDataset(20, 20, function(x, y) { return 200 * Math.sin(x / 2) + y * 20; });
        };
        async function maxDifference(ds) {
          // fps-min-threshold= equal to fps-threshold= fixes the threshold
          var a = await getElevation('-smooth-terrain', ds());
          var b = await getElevation('-smooth-terrain fps-min-threshold=10', ds());
          return Math.max.apply(null, a.map(function(v, i) { return Math.abs(v - b[i]); }));
        }
        var g = await maxDifference(gentle), s = await maxDifference(steep);
        assert(g > 0.01 && s < 0.001, g + ', ' + s);
      })

      it('a fixed threshold is recorded as fps-min-threshold= equal to fps-threshold=', async function () {
        var d = await getSettings('-smooth-terrain 2 fps-min-threshold=15');
        assert.deepEqual(presetSettings(d), [2, 15, 4, 1, 15, null, null]);
        d = await getSettings('-smooth-terrain fps-threshold=0.5');
        assert.deepEqual([d.fps_threshold, d.fps_min_threshold], [0.5, 0.5]);
      })

      it('the recorded settings can be pasted, and reproduce the result', async function () {
        var cmd = '-smooth-terrain 3 fps-levels=2 fps-min-threshold=2 fps-slope-factor=4 fps-slope-radius=5 fps-blend=3,12';
        var d = await getSettings(cmd);
        var str = internal.formatSmoothingSettings(d);
        assert.deepEqual([d.fps_min_threshold, d.fps_slope_factor, d.fps_slope_radius, d.fps_blend],
          [2, 4, 5, '3,12']);
        assert.deepEqual(await getElevation('-smooth-terrain ' + str), await getElevation(cmd));
        assert.equal((await getSettings('-smooth-terrain fps-levels=2 fps-blend=off')).fps_blend, 'off');
      })

      it('rejects dynamic smoothing settings that don\'t apply', async function () {
        await assert.rejects(runOnDataset(dem(), '-smooth-terrain fps-min-threshold=25'), /not be larger/);
        await assert.rejects(runOnDataset(dem(), '-smooth-terrain fps-blend=5,15'), /two-level/);
        await assert.rejects(runOnDataset(dem(), '-smooth-terrain fps-levels=2 fps-blend=15,5'), /fps-blend/);
        await assert.rejects(runOnDataset(dem(), '-smooth-terrain fps-min-threshold=0'), /fps-min-threshold/);
        await assert.rejects(runOnDataset(dem(), '-smooth-terrain fps-spread=2 fps-slope-factor=1'), /fps-spread/);
      })

      it('workers give the same output as the main thread', async function () {
        this.timeout(20000);
        var big = function() {
          return makeElevationDataset(240, 180, function(x, y) {
            return 300 * Math.sin(x / 9) * Math.cos(y / 13) + 80 * Math.sin((x * 3 + y) / 4) - 60;
          });
        };
        var cmd = '-smooth-terrain 3 fps-levels=2 min-elevation=0';
        assert.deepEqual(await getElevation(cmd + ' workers=3', big()), await getElevation(cmd + ' workers=0', big()));
      })
    })

    it('highlights=, shadow-color= and highlight-color= style the shading', async function () {
      var catalog = await runOnDataset(makeElevationDataset(20, 20, function(x, y) {
        return 200 * Math.sin(x / 3) + y * 5;
      }), '-hillshade highlights=1 shadow-color=#203050 highlight-color=rgb(255,240,180)');
      var lyr = catalog.getLayers()[0].layer;
      var samples = lyr.raster.grid.samples;
      var shadows = 0, highlights = 0, i, rgb;
      for (i = 0; i < samples.length; i += 4) {
        if (samples[i + 3] === 0) continue;
        rgb = Array.from(samples.subarray(i, i + 3)).join(',');
        if (rgb == '32,48,80') shadows++;
        else if (rgb == '255,240,180') highlights++;
        else assert.fail('unexpected color: ' + rgb);
      }
      assert(shadows > 0 && highlights > 0);
      assert.equal(lyr.raster.derivation.highlights, 1);
      assert.equal(lyr.raster.derivation.shadow_color, '#203050');
      assert.equal(lyr.raster.derivation.highlight_color, 'rgb(255,240,180)');
    })

    it('rejects invalid highlights= and colors', async function () {
      var dem = function() { return makeElevationDataset(5, 5, slope); };
      await assert.rejects(runOnDataset(dem(), '-hillshade highlights=-1'), /highlights/);
      await assert.rejects(runOnDataset(dem(), '-hillshade shadow-color=notacolor'), /shadow-color/);
      await assert.rejects(runOnDataset(dem(), '-hillshade highlight-color=#12'), /highlight-color/);
    })

    it('formatHillshadeSettings() prints the settings used as command options', async function () {
      var catalog = await runOnDataset(makeElevationDataset(20, 20, slope),
        '-hillshade verbose lighting=hard highlight-color=#fff0b4');
      var d = catalog.getLayers()[0].layer.raster.derivation;
      var str = internal.formatHillshadeSettings(d);
      assert.equal(d.exaggeration, 1.5); // automatic, from about 111 m pixels
      assert.equal(str, 'azimuth=315 altitude=45 lighting=hard exaggeration=1.5' +
        ' max-opacity=0.55 highlights=1 gamma=0.7 highlight-color=#fff0b4 smoothing=0' +
        ' light-adjust=0 ambient=0.5 texture=0 aerial=0');
    })

    it('rejects an invalid lighting= value', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(20, 20, slope), '-hillshade lighting=sun'),
        /lighting= should be one of: balanced, hard, soft$/);
    })

    it('rejects non-raster layers', async function () {
      await assert.rejects(api.applyCommands('-rectangle bbox=0,0,1,1 -hillshade'), /raster layer/);
    })

    it('opaque is recorded in the derivation, and printed as a flag', async function () {
      var dem = function() { return makeElevationDataset(10, 10, slope); };
      var opaque = (await runOnDataset(dem(), '-hillshade opaque')).getLayers()[0].layer.raster.derivation;
      var shadow = (await runOnDataset(dem(), '-hillshade')).getLayers()[0].layer.raster.derivation;
      assert.strictEqual(opaque.opaque, true);
      assert.strictEqual(shadow.opaque, false);
      assert(/^opaque /.test(internal.formatHillshadeSettings(opaque)));
      assert.equal(internal.formatHillshadeSettings(shadow).indexOf('opaque'), -1);
      assert(!('style' in opaque));
    })

    it('hillshades made with style=opaque are opaque', function () {
      assert(internal.isOpaqueHillshade({type: 'hillshade', opaque: true}));
      assert(internal.isOpaqueHillshade({type: 'hillshade', style: 'opaque'}));
      assert(!internal.isOpaqueHillshade({type: 'hillshade', opaque: false}));
      assert(!internal.isOpaqueHillshade({type: 'hillshade', style: 'shadow'}));
    })

    it('base-color= sets the color of flat ground, and implies opaque', async function () {
      var catalog = await runOnDataset(makeElevationDataset(10, 10, function() { return 100; }),
        '-hillshade base-color=#e0d8c0');
      var lyr = catalog.getLayers()[0].layer;
      assert.strictEqual(lyr.raster.derivation.opaque, true);
      assert.equal(lyr.raster.derivation.base_color, '#e0d8c0');
      assert.deepEqual(Array.from(lyr.raster.grid.samples.subarray(0, 4)), [224, 216, 192, 255]);
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade base-color=bogus'),
        /base-color/);
    })

    it('opaque records the colors it used, and no opacities', async function () {
      var d = (await runOnDataset(makeElevationDataset(10, 10, slope), '-hillshade opaque'))
        .getLayers()[0].layer.raster.derivation;
      var stops = internal.getHillshadeRampColors(null, null, null);
      assert.equal(d.base_color, '#d7d7d7');
      assert.equal(d.highlight_color, '#ffffff');
      assert.equal(d.shadow_color, internal.formatColor(stops.shadow));
      assert.equal(d.max_opacity, null);
      assert.equal(d.highlights, null);
    })

    it('opaque rejects max-opacity= and highlights=', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade opaque max-opacity=0.8'),
        /max-opacity/);
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade base-color=#e0d8c0 highlights=0.5'),
        /highlights/);
    })

    it('style= is no longer an option', async function () {
      await assert.rejects(runOnDataset(makeElevationDataset(5, 5, slope), '-hillshade style=opaque'),
        /style/);
    })
  })

  // The hillshade panel reads the terrain once, keeps the fields of shading,
  // and recombines them as settings change
  describe('shading from kept fields, as the hillshade panel does', function () {
    this.timeout(20000);
    function terrain(x, y) {
      return 300 * Math.sin(x / 9) * Math.cos(y / 13) + 80 * Math.sin((x * 3 + y) / 4) - 60;
    }

    async function getPanelPixels(dataset, opts) {
      var lyr = dataset.layers[0];
      var t = internal.readHillshadeTerrain(lyr, dataset, opts);
      var shading = internal.getHillshadeShading(opts, t);
      var grid = t.grid;
      var fields;
      if (shading.smoothing > 0) {
        grid = Object.assign({}, grid, {elev: (await internal.runSmoothingStage(grid,
          internal.getSmoothingSettings(shading.smoothing, {}, t.cells.median, t.minElevation), opts)).elev});
      }
      fields = await internal.runShadingFieldsStage(grid, shading.settings, opts);
      return Array.from(internal.writeHillshadeRgba(internal.combineShadingFields(fields, grid, shading.settings),
        grid.valid, shading.style, shading.colors));
    }

    async function getCommandPixels(dataset, str) {
      var catalog = await runOnDataset(dataset, '-hillshade ' + str);
      return Array.from(catalog.getLayers()[0].layer.raster.grid.samples);
    }

    [
      '',
      'opaque ambient=0 aerial=0.6',
      'base-color=#e0d6c4 texture=0.5 min-elevation=0 smoothing=2 azimuth=200 lighting=soft',
      'max-opacity=0.8 highlights=0.4 gamma=1.2 exaggeration=3 texture=0.3 texture-highlights=0.5 workers=3'
    ].forEach(function(str) {
      it('gives the same image as -hillshade ' + str, async function () {
        var opts = internal.parseCommands('-hillshade ' + str)[0].options;
        assert.deepEqual(await getPanelPixels(makeElevationDataset(240, 180, terrain), opts),
          await getCommandPixels(makeElevationDataset(240, 180, terrain), str));
      })
    });

    it('the fields don\'t change when they are combined', function () {
      var grid = {elev: makeElevation(20, 20, terrain), valid: null, width: 20, height: 20,
        cellWidths: constantCells(20, 100), cellHeights: constantCells(20, 100)};
      var s = {lights: internal.getHillshadeLights(315, 45, 'balanced'), exaggeration: 1.5, ambient: 0.5,
        aerial: 0.5, texture: 0.5, textureDetail: 0.5, textureHighlights: 0, minElevation: null,
        style: 'shadow', toneOpts: {gamma: 0.7, maxShade: 1.2}};
      var fields = internal.computeShadingFields(grid, s);
      var copies = {shade: Float32Array.from(fields.shade), openness: Float32Array.from(fields.openness),
        texture: Float32Array.from(fields.texture)};
      internal.combineShadingFields(fields, grid, s);
      assert.deepEqual(fields, copies);
    })
  })
})
