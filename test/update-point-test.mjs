import api from '../mapshaper.js';
import assert from 'assert';

function run(cmd) {
  return api.applyCommands(cmd + ' -o out.json');
}

async function features(cmd) {
  return JSON.parse((await run(cmd))['out.json']).features;
}

describe('mapshaper-update-point.mjs', function () {

  it('moves a point that has no symbol, keeping its attributes', async function () {
    var input = {type: 'FeatureCollection', features: [
      {type: 'Feature', properties: {name: 'a'}, geometry: {type: 'Point', coordinates: [0, 0]}},
      {type: 'Feature', properties: {name: 'b'}, geometry: {type: 'Point', coordinates: [1, 1]}}
    ]};
    var out = await api.applyCommands('-i in.json -update-point ids=1 coordinates=5,7 -o out.json',
      {'in.json': input});
    var f = JSON.parse(out['out.json']).features[1];
    assert.deepEqual(f.geometry, {type: 'Point', coordinates: [5, 7]});
    assert.deepEqual(f.properties, {name: 'b'});
  });

  it('moves a symbol', async function () {
    var f = (await features('-symbols coordinates=0,0 type=star radius=5 ' +
      '-update-point ids=0 coordinates=3,4'))[0];
    assert.deepEqual(f.geometry, {type: 'Point', coordinates: [3, 4]});
    assert.equal(f.properties.icon, 'star');
  });

  it('a label is rejected', async function () {
    await assert.rejects(function() {
      return run('-labels coordinates=0,0 text=A -update-point ids=0 coordinates=5,5');
    }, /is not a point \(it is a label\)/);
  });

  it('an id is required', async function () {
    await assert.rejects(function() {
      return run('-symbols coordinates=0,0 type=star -update-point coordinates=5,5');
    }, /Missing required ids parameter \(the feature id of the point to update\)/);
  });
});
