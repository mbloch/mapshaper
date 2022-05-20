
import {IdLookupIndex} from '../src/indexing/mapshaper-id-lookup-index';
import api from '../';
import assert from 'assert';


describe('mapshaper-id-lookup-index.js', function () {
  it('clearable index', function () {
    var idx = new IdLookupIndex(10, true);
    assert.equal(idx.hasId(0), false);
    assert.equal(idx.getId(0), -1);
    idx.setId(0, 0);
    assert.equal(idx.hasId(0), true);
    assert.strictEqual(idx.getId(0), 0);
    idx.setId(1, 5);
    idx.setId(2, 6);
    idx.clear();
    assert.equal(idx.hasId(0), false);
    assert.equal(idx.getId(0), -1);
    assert.equal(idx.hasId(1), false);
    assert.equal(idx.hasId(2), false);
  })
})
