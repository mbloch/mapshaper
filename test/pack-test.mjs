import api from '../mapshaper.js';
import assert from 'assert';
import { unpackSessionData } from '../src/pack/mapshaper-unpack';

describe('mapshaper-pack.mjs', function () {
  it('simple round trip', async function () {
    var data = [{foo: 'bar'}];
    var out = await api.applyCommands('-i data.json -o out.msx', {'data.json': data});
    var obj = await unpackSessionData(out['out.msx']);
    var timestamp = Date.parse(obj.created); // NaN if not a parsable ISO date
    assert(timestamp > 0);
    assert.equal(obj.version, 1);
    assert.deepEqual(obj.datasets[0].layers[0].data.getRecords(), [{foo: 'bar'}]);
  });

  it('read from a .msx snapshot file', async function() {
    var cmd = '-i test/data/msx/mapshaper_snapshot.msx -o format=geojson';
    var out = await api.applyCommands(cmd);
    var rectangle = JSON.parse(out['rectangle.json']);
    var points = JSON.parse(out['points.json']);
    var polygons = JSON.parse(out['polygons.json']);
    assert.equal(rectangle.geometries.length, 1);
    assert.equal(points.features.length, 6);
    assert.equal(polygons.features.length, 6);
  })

  it('read from a .msx snapshot file with compressed arcs', async function() {
    var cmd = '-i test/data/msx/mapshaper_snapshot.msx -o format=geojson';
    var out = await api.applyCommands(cmd);
    var cmd2 = '-i test/data/msx/mapshaper_snapshot_2.msx -o format=geojson';
    var out2 = await api.applyCommands(cmd);
    assert.deepEqual(JSON.parse(out['rectangle.json']), JSON.parse(out2['rectangle.json']))
    assert.deepEqual(JSON.parse(out['points.json']), JSON.parse(out2['points.json']))
    assert.deepEqual(JSON.parse(out['polygons.json']), JSON.parse(out2['polygons.json']))

  })

  it('simplification data is removed on export', async function() {
    var cmd = '-i test/data/two_states.json -o a.msx -simplify 50% -o b.msx';
    var out = await api.applyCommands(cmd);
    assert(out['a.msx'].length > out['b.msx'].length);

  });
})
