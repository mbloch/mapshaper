import assert from 'assert';
import api from '../mapshaper.js';
import {
  formatAzimuth, formatHillshadeSliderValue, getDefaultHillshadeSettings, getHillshadeCommand, getHillshadeOptions,
  getHillshadeSlider, getHillshadeSliderValue
} from '../src/gui/gui-hillshade-settings.mjs';

var internal = api.internal;
var colorFns = {
  shadow: function(hex, s, color) {
    return internal.formatColor(internal.getHillshadeShadowColor(internal.parseColor(hex), s,
      color ? internal.parseColor(color) : null));
  },
  highlight: function(hex, s, color) {
    return internal.formatColor(internal.getHillshadeHighlightColor(internal.parseColor(hex), s,
      color ? internal.parseColor(color) : null));
  }
};

// the transparent style, unless @changes sets one
function command(changes, keep) {
  var settings = Object.assign(getDefaultHillshadeSettings(), {style: 'shadow'}, changes);
  return getHillshadeCommand(settings, 1.5, colorFns, keep);
}

function makeDem() {
  var w = 12, h = 10, samples = new Float32Array(w * h);
  for (var i = 0; i < samples.length; i++) samples[i] = 100 + 40 * Math.sin(i / 3);
  return {
    info: {crs_string: 'wgs84'},
    layers: [{name: 'dem', raster_type: 'grid', raster: {sourceId: 'dem', interpretation: 'continuous',
      grid: {width: w, height: h, bands: 1, pixelType: 'float32', samples: samples, sampleBands: [0],
        nodata: null, bbox: [0, 0, w * 0.001, h * 0.001], transform: [0.001, 0, 0, 0, -0.001, h * 0.001]}}}]
  };
}

async function getDerivation(cmd) {
  var job = new internal.Job(new internal.Catalog().addDataset(makeDem()));
  await internal.runParsedCommands(internal.parseCommands(cmd), job);
  return job.catalog.getLayers()[0].layer.raster.derivation;
}

describe('gui-hillshade-settings.mjs', function () {
  it('defaults are -hillshade\'s defaults, and give a plain -hillshade', async function () {
    var settings = getDefaultHillshadeSettings();
    var d = await getDerivation('-hillshade');
    ['azimuth', 'altitude', 'lighting', 'ambient', 'gamma', 'max_opacity', 'highlights',
      'smoothing', 'texture', 'aerial'].forEach(function(key) {
      assert.strictEqual(settings[key], d[key], key);
    });
    assert.strictEqual(d.opaque, false);
    assert.equal(command({}), '-hillshade');
    assert.equal(command({}, true), '-hillshade +');
  })

  it('the panel starts on the opaque style', function () {
    var settings = getDefaultHillshadeSettings();
    assert.equal(settings.style, 'opaque');
    assert.equal(getHillshadeCommand(settings, 1.5, colorFns, false), '-hillshade opaque');
  })

  it('opaque defaults are -hillshade opaque\'s defaults', async function () {
    var settings = getDefaultHillshadeSettings();
    var d = await getDerivation('-hillshade opaque');
    assert.equal(settings.base_color, d.base_color);
    assert.equal(command({style: 'opaque'}), '-hillshade opaque');
  })

  it('changed settings become options', function () {
    assert.equal(command({lighting: 'soft', smoothing: 2, ambient: 0.3, texture: 0.4, aerial: 0.2, gamma: 0.9,
      altitude: 30, max_opacity: 0.7, highlights: 0.5, shadow_color: '#203040'}),
    '-hillshade max-opacity=0.7 highlights=0.5 shadow-color=#203040 altitude=30 lighting=soft' +
      ' smoothing=2 ambient=0.3 texture=0.4 aerial=0.2 gamma=0.9');
  })

  it('azimuth is written in compass degrees', function () {
    assert.equal(command({azimuth: 450}), '-hillshade azimuth=90');
    assert.equal(command({azimuth: 200}), '-hillshade azimuth=200');
    assert.equal(command({azimuth: 315}), '-hillshade');
    assert.equal(formatAzimuth(315), '315° NW');
    assert.equal(formatAzimuth(495), '135° SE');
    assert.equal(formatAzimuth(360), '0° N');
  })

  it('exaggeration is a power-of-2 factor of the automatic exaggeration', function () {
    assert.equal(command({exaggeration: 1}), '-hillshade exaggeration=3');
    assert.equal(command({exaggeration: -1}), '-hillshade exaggeration=0.75');
    assert.equal(command({exaggeration: 0}), '-hillshade');
  })

  it('the exaggeration readout has a decimal below 10', function () {
    var slider = getHillshadeSlider('exaggeration');
    assert.equal(formatHillshadeSliderValue(slider, 0, 1), '1.0');
    assert.equal(formatHillshadeSliderValue(slider, -2, 1), '0.25');
    assert.equal(formatHillshadeSliderValue(slider, 1, 1.5), '3.0');
    assert.equal(formatHillshadeSliderValue(slider, 2, 3), '12');
  })

  it('sliders settle on their defaults near them', function () {
    var azimuth = getHillshadeSlider('azimuth');
    assert.equal(getHillshadeSliderValue(azimuth, 313), 315);
    assert.equal(getHillshadeSliderValue(azimuth, 310), 310);
    assert.equal(getHillshadeSliderValue(getHillshadeSlider('ambient'), 0.333), 0.33);
  })

  it('an opaque hillshade\'s colors follow its base color', function () {
    assert.equal(command({style: 'opaque', base_color: '#e0d6c4'}), '-hillshade base-color=#e0d6c4');
    var opts = getHillshadeOptions(Object.assign(getDefaultHillshadeSettings(),
      {style: 'opaque', shadow_strength: 1.5, highlight_strength: 0.5}), 1.5, colorFns);
    assert.equal(opts.base_color, '#d7d7d7');
    assert.equal(opts.shadow_color, colorFns.shadow('#d7d7d7', 1.5));
    assert.equal(opts.highlight_color, colorFns.highlight('#d7d7d7', 0.5));
    assert.equal(opts.opaque, undefined);
  })

  it('an opaque hillshade\'s chosen colors are used at strength 1, and faded toward the base below it', function () {
    assert.equal(command({style: 'opaque', opaque_shadow_color: '#203040', opaque_highlight_color: '#fff0c0'}),
      '-hillshade base-color=#d7d7d7 shadow-color=#203040 highlight-color=#fff0c0');
    assert.equal(command({style: 'opaque', opaque_shadow_color: '#203040'}),
      '-hillshade base-color=#d7d7d7 shadow-color=#203040');
    var opts = getHillshadeOptions(Object.assign(getDefaultHillshadeSettings(), {style: 'opaque',
      opaque_shadow_color: '#203040', shadow_strength: 0.5, opaque_highlight_color: '#fff0c0', highlight_strength: 0}),
      1.5, colorFns);
    assert.equal(opts.highlight_color, '#d7d7d7');
    assert.notEqual(opts.shadow_color, '#203040');
    assert.notEqual(opts.shadow_color, '#d7d7d7');
  })

  it('transparent settings are left out of an opaque command, and the reverse', function () {
    assert.equal(command({style: 'opaque', max_opacity: 0.8, shadow_color: '#203040'}), '-hillshade opaque');
    assert.equal(command({base_color: '#e0d6c4', shadow_strength: 2}), '-hillshade');
    assert.equal(command({opaque_shadow_color: '#203040'}), '-hillshade');
  })

  it('Flatten below 0 writes min-elevation=0', async function () {
    assert.equal(command({below_zero: 'flatten', smoothing: 1, ambient: 0.3}),
      '-hillshade smoothing=1 min-elevation=0 ambient=0.3');
    assert.equal(command({below_zero: 'shade'}), '-hillshade');
    assert.strictEqual((await getDerivation(command({below_zero: 'flatten'}))).min_elevation, 0);
  })

  it('the panel\'s flattened terrain is the command\'s', function () {
    var dataset = makeDem();
    var lyr = dataset.layers[0];
    var samples = lyr.raster.grid.samples;
    for (var i = 0; i < 30; i++) samples[i] = -50 + i;
    var plain = internal.readHillshadeTerrain(lyr, dataset, {});
    var raised = internal.raiseHillshadeTerrain(plain, 0);
    var expected = internal.readHillshadeTerrain(lyr, dataset, {min_elevation: 0});
    assert.deepEqual(Array.from(raised.grid.elev), Array.from(expected.grid.elev));
    assert.strictEqual(raised.minElevation, 0);
    assert.equal(plain.grid.elev[0], -50); // the plain terrain is left alone
  })

  it('the command runs', async function () {
    var d = await getDerivation(command({style: 'opaque', base_color: '#e0d6c4', shadow_strength: 1.4,
      azimuth: 400, exaggeration: 0.5, texture: 0.3}));
    assert.equal(d.base_color, '#e0d6c4');
    assert.equal(d.azimuth, 40);
  })
});
