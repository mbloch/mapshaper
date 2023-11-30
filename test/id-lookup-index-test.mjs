
import { IdLookupIndex, ArcLookupIndex, ClearableArcLookupIndex } from '../src/indexing/mapshaper-id-lookup-index';
import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-id-lookup-index.js', function () {
  it('clearable index', function () {
    var idx = new ClearableArcLookupIndex(10, true);
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
  });

  it('IdLookupIndex', function() {
    var idx = new IdLookupIndex(10);
    assert.equal(idx.hasId(0), false);
    assert.equal(idx.getId(0), -1);
    idx.setId(0, 0);
    assert.equal(idx.hasId(0), true);
    assert.strictEqual(idx.getId(0), 0);
    idx.setId(1, 5);
    idx.setId(2, 6);

    // accept out-of-range keys
    assert.equal(idx.hasId(-23), false);
    assert.equal(idx.hasId(3000), false);
    assert.equal(idx.getId(-23), -1);
    assert.equal(idx.getId(3000), -1);

    assert.throws(function() {
      idx.clear();
    });

    assert.throws(function() {
      idx.setId(-1, 0);
    });

    assert.throws(function() {
      idx.setId(1, -1);
    });

  })

  it('ArcLookupIndex', function() {
    var idx = new ArcLookupIndex(10, true);
    assert.equal(idx.hasId(0), false);
    assert.equal(idx.getId(0), -1);
    idx.setId(0, 0);
    assert.equal(idx.hasId(0), true);
    assert.strictEqual(idx.getId(0), 0);
    idx.setId(1, 5);
    assert.equal(idx.hasId(1), true);

    idx.setId(-2, 6);
    assert.equal(idx.hasId(-2), true);
    assert.equal(idx.getId(-2), 6);

    assert.throws(function() {
      idx.clear();
    });

    assert.equal(idx.hasId(2), false);

    // accept out-of-range keys
    assert.equal(idx.hasId(-23), false);
    assert.equal(idx.hasId(3000), false);
    assert.equal(idx.getId(-23), -1);
    assert.equal(idx.getId(3000), -1);
  })

})
