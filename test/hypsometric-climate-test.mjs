import assert from 'assert';
import { getClimateWeights, getClimatePreset } from '../src/color/hypsometric-climate.mjs';

describe('hypsometric-climate.mjs', function() {
  it('gives the weights of the presets, summing to 1, on land', function() {
    var w = getClimateWeights(10, 24); // the Sahara
    var sum = Object.keys(w).reduce(function(memo, name) { return memo + w[name]; }, 0);
    assert.deepEqual(Object.keys(w), ['Desert', 'Steppe', 'Tropical', 'Temperate', 'Boreal', 'Polar']);
    assert(Math.abs(sum - 1) < 1e-9);
    assert(w.Desert > 0.8);
    assert(getClimateWeights(70, 48.5).Steppe > 0.8); // the Kazakh steppe
    assert(getClimateWeights(-102, 40).Steppe > 0.8); // the Great Plains
    assert(getClimateWeights(68, 45).Steppe > 0.6); // Kazakhstan's shrub desert
    assert(getClimateWeights(82, 39).Desert > 0.7); // the Taklamakan
    assert(getClimateWeights(135, -25).Desert > 0.9); // hot deserts stay Desert
    assert(getClimateWeights(-40, 72).Polar > 0.8); // Greenland
    assert(getClimateWeights(-62, -4).Tropical > 0.8); // the Amazon
    assert(getClimateWeights(129.7, 62).Boreal > 0.8); // Yakutsk
    // alpine tundra is left to the elevation ramps
    assert(getClimateWeights(-125.5, 51.5).Polar < 0.3); // the Coast Mountains
    assert(getClimateWeights(-93, 42).Temperate > 0.8); // Iowa
  });

  it('gives null at sea, away from land', function() {
    assert.equal(getClimateWeights(-150, 0), null);
    assert.equal(getClimateWeights(NaN, 0), null);
  });

  it('wraps around the antimeridian', function() {
    var a = getClimateWeights(179.9, 66), b = getClimateWeights(-180.1, 66);
    Object.keys(a).forEach(function(name) {
      assert(Math.abs(a[name] - b[name]) < 1e-9, name);
    });
    assert(getClimateWeights(180, 66)); // Chukotka
  });

  it('chooses the preset with the most weight across points', function() {
    assert.equal(getClimatePreset([[-60, -5], [20, 0]]), 'Tropical');
    assert.equal(getClimatePreset([[90, 62]]), 'Boreal');
    assert.equal(getClimatePreset([[-150, 0]]), null);
    assert.equal(getClimatePreset([]), null);
  });
});
