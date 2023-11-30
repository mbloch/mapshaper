import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;

describe('mapshaper-stash.js', function () {
  it('tests', function() {
    internal.stashVar('foo', 'bar');
    assert.throws(function() {
      internal.stashVar('foo', 'baz');
    })
    assert.equal(internal.getStashedVar('foo'), 'bar');
    internal.clearStash();
    assert.equal(internal.getStashedVar('foo'), null);
    // assert.throws(function() {
    //   internal.getStashedVar('foo');
    // });

  })

})
