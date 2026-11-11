import assert from 'assert';
import { getClimateWeights, getClimatePreset } from '../src/color/hypsometric-climate.mjs';

describe('hypsometric-climate.mjs', function() {
  it('gives the weights of the presets, summing to 1, on land', function() {
    var w = getClimateWeights(10, 24); // the Sahara
    var sum = w.Arid + w.Lush + w.Temperate + w.Polar;
    assert(Math.abs(sum - 1) < 1e-9);
    assert(w.Arid > 0.8);
    assert(getClimateWeights(-40, 72).Polar > 0.8); // Greenland
  });

  it('gives null at sea, away from land', function() {
    assert.equal(getClimateWeights(-150, 0), null);
    assert.equal(getClimateWeights(NaN, 0), null);
  });

  it('wraps around the antimeridian', function() {
    assert.deepEqual(getClimateWeights(179.9, 66), getClimateWeights(-180.1, 66));
    assert(getClimateWeights(180, 66)); // Chukotka
  });

  it('chooses the preset with the most weight across points', function() {
    assert.equal(getClimatePreset([[-60, -5], [20, 0]]), 'Lush');
    assert.equal(getClimatePreset([[90, 62]]), 'Temperate');
    assert.equal(getClimatePreset([[-150, 0]]), null);
    assert.equal(getClimatePreset([]), null);
  });
});
