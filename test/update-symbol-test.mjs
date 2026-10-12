import api from '../mapshaper.js';
import assert from 'assert';

function run(cmd) {
  return api.applyCommands(cmd + ' -o out.json');
}

async function features(cmd) {
  return JSON.parse((await run(cmd))['out.json']).features;
}

async function rejects(cmd, rxp) {
  await assert.rejects(function() {
    return run(cmd);
  }, rxp);
}

describe('mapshaper-update-symbol.mjs', function () {

  it('moves an icon', async function () {
    var f = (await features('-symbols coordinates=0,0 type=star radius=5 ' +
      '-update-symbol ids=0 coordinates=5,7'))[0];
    assert.deepEqual(f.geometry, {type: 'Point', coordinates: [5, 7]});
    assert.deepEqual(f.properties, {icon: 'star', 'icon-size': 10, 'icon-fill': 'magenta'});
  });

  it('moves the knots of a curve', async function () {
    var f = (await features('-symbols coordinates=0,0,10,8,20,0 type=curve line-end=arrow ' +
      '-update-symbol ids=0 coordinates=0,0,10,20,20,0'))[0];
    assert.deepEqual(f.geometry.coordinates, [[0, 0], [10, 20], [20, 0]]);
    assert.equal(f.properties['line-end'], 'arrow');
  });

  it('closes a curve, keeping the repeated point', async function () {
    var f = (await features('-symbols coordinates=0,0,10,8,20,0 type=curve ' +
      '-update-symbol ids=0 coordinates=0,0,10,8,20,0,0,0'))[0];
    assert.equal(f.geometry.coordinates.length, 4);
  });

  it('moves a circle written as r=', async function () {
    var f = (await features('-symbols coordinates=0,0 type=circle radius=3 ' +
      '-update-symbol ids=0 coordinates=1,1'))[0];
    assert.deepEqual(f.geometry.coordinates, [1, 1]);
  });

  it('leaves other features alone', async function () {
    var ff = await features('-symbols coordinates=0,0 type=star ' +
      '-symbols coordinates=1,1 type=square -update-symbol ids=1 coordinates=9,9');
    assert.deepEqual(ff[0].geometry.coordinates, [0, 0]);
    assert.deepEqual(ff[1].geometry.coordinates, [9, 9]);
  });

  it('a curve needs two points', async function () {
    await rejects('-symbols coordinates=0,0,10,0 type=curve -update-symbol ids=0 coordinates=5,5',
      /at least two points/);
  });

  it('a label is rejected', async function () {
    await rejects('-labels coordinates=0,0 text=A -update-symbol ids=0 coordinates=5,5',
      /is not a symbol/);
  });

  it('a curve in a layer of labels is accepted', async function () {
    var ff = await features('-labels coordinates=0,0 text=A ' +
      '-symbols coordinates=0,0,10,0 type=curve -update-symbol ids=1 coordinates=0,0,10,10');
    assert.deepEqual(ff[1].geometry.coordinates, [[0, 0], [10, 10]]);
  });

  it('a feature without symbol properties is rejected', async function () {
    await assert.rejects(function() {
      return api.applyCommands('-i in.json -update-symbol ids=0 coordinates=5,5 -o out.json',
        {'in.json': {type: 'Point', coordinates: [0, 0]}});
    }, /is not a symbol/);
  });

  it('an id is required', async function () {
    await rejects('-symbols coordinates=0,0 type=star -update-symbol coordinates=5,5',
      /Missing required ids parameter \(the feature id of the symbol to update\)/);
  });

  it('a non-point layer is rejected', async function () {
    await rejects('-rectangle bbox=0,0,1,1 -update-symbol ids=0 coordinates=5,5',
      /Symbols can only be updated in a point layer/);
  });
});
