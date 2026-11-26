import assert from 'assert';
import api from '../mapshaper.js';
import {
  formatAzimuth, formatHillshadeSliderValue, getDefaultHillshadeSettings, getHillshadeCommand,
  getHillshadeSlider, getHillshadeSliderValue
} from '../src/gui/gui-hillshade-settings.mjs';

var internal = api.internal;

function command(changes, keep) {
  return getHillshadeCommand(Object.assign(getDefaultHillshadeSettings(), changes), 1.5, keep);
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
  it('defaults are -hillshade opaque\'s defaults, and give a plain -hillshade opaque', async function () {
    var settings = getDefaultHillshadeSettings();
    var d = await getDerivation('-hillshade opaque');
    ['azimuth', 'altitude', 'lighting', 'ambient', 'gamma',
      'smoothing', 'texture', 'aerial', 'base_color'].forEach(function(key) {
      assert.strictEqual(settings[key], d[key], key);
    });
    assert.equal(command({}), '-hillshade opaque');
    assert.equal(command({}, true), '-hillshade opaque +');
  })

  it('changed settings become options', function () {
    assert.equal(command({lighting: 'soft', smoothing: 2, ambient: 0.3, texture: 0.4, aerial: 0.2, gamma: 0.9,
      altitude: 30}),
    '-hillshade opaque altitude=30 lighting=soft smoothing=2 ambient=0.3 texture=0.4 aerial=0.2 gamma=0.9');
  })

  it('azimuth is written in compass degrees', function () {
    assert.equal(command({azimuth: 450}), '-hillshade opaque azimuth=90');
    assert.equal(command({azimuth: 200}), '-hillshade opaque azimuth=200');
    assert.equal(command({azimuth: 315}), '-hillshade opaque');
    assert.equal(formatAzimuth(315), '315° NW');
    assert.equal(formatAzimuth(495), '135° SE');
    assert.equal(formatAzimuth(360), '0° N');
  })

  it('exaggeration is a power-of-2 factor of the automatic exaggeration', function () {
    assert.equal(command({exaggeration: 1}), '-hillshade opaque exaggeration=3');
    assert.equal(command({exaggeration: -1}), '-hillshade opaque exaggeration=0.75');
    assert.equal(command({exaggeration: 0}), '-hillshade opaque');
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

  it('another base color becomes base-color=, and the other colors are derived from it', function () {
    assert.equal(command({base_color: '#e0d6c4'}), '-hillshade base-color=#e0d6c4');
  })

  it('chosen shadow and highlight colors are written with the base color', function () {
    assert.equal(command({shadow_color: '#203040', highlight_color: '#fff0c0'}),
      '-hillshade base-color=#d7d7d7 shadow-color=#203040 highlight-color=#fff0c0');
    assert.equal(command({shadow_color: '#203040'}),
      '-hillshade base-color=#d7d7d7 shadow-color=#203040');
  })

  it('Flatten below 0 writes min-elevation=0', async function () {
    assert.equal(command({below_zero: 'flatten', smoothing: 1, ambient: 0.3}),
      '-hillshade opaque smoothing=1 min-elevation=0 ambient=0.3');
    assert.equal(command({below_zero: 'shade'}), '-hillshade opaque');
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
    var d = await getDerivation(command({base_color: '#e0d6c4', shadow_color: '#403830',
      azimuth: 400, exaggeration: 0.5, texture: 0.3}));
    assert.strictEqual(d.opaque, true);
    assert.equal(d.base_color, '#e0d6c4');
    assert.equal(d.shadow_color, '#403830');
    assert.equal(d.azimuth, 40);
  })
});
