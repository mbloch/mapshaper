import assert from 'assert';
import { clearStash, getStashedVar, stashVar } from '../src/mapshaper-stash';

describe('mapshaper-stash.js', function () {
  it('tests', function() {
    stashVar('foo', 'bar');
    assert.throws(function() {
      stashVar('foo', 'baz');
    })
    assert.equal(getStashedVar('foo'), 'bar');
    clearStash();
    assert.equal(getStashedVar('foo'), null);
    // assert.throws(function() {
    //   getStashedVar('foo');
    // });

  })

})
