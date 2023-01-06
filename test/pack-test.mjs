import api from '../';
import assert from 'assert';
import { unpackSession } from '../src/pack/mapshaper-unpack';

describe('mapshaper-pack.mjs', function () {
  it('test basic pack format', async function () {
    var data = [{foo: 'bar'}];
    var out = await api.applyCommands('-i data.json -o out.msx', {'data.json': data});
    var obj = unpackSession(out['out.msx']);
    var timestamp = Date.parse(obj.created); // NaN if not a parsable ISO date
    assert(timestamp > 0);
    assert.equal(obj.version, 1);
    assert.deepEqual(obj.datasets[0].layers[0].data.getRecords(), [{foo: 'bar'}]);
  })
})
