import assert from 'assert';
import { getFrameVisibilityOptions } from '../src/gui/gui-frame-visibility';

function format(str) {
  return str.includes(' ') ? '"' + str + '"' : str;
}

function member(ref, start, prev, next) {
  return {ref: ref, start: start, prev: prev, next: next};
}

describe('gui-frame-visibility.mjs', function () {
  describe('getFrameVisibilityOptions()', function () {
    it('hides a layer', function () {
      var opts = getFrameVisibilityOptions([member('a', false, false, true), member('b', false, false, false)], format);
      assert.deepEqual(opts, {run: 'hide-layers=a', record: 'hide-layers=a'});
    });

    it('records the change from the start of the run', function () {
      // a was hidden earlier in the run; b is hidden now
      var opts = getFrameVisibilityOptions([member('a', false, true, true), member('b', false, false, true),
        member('c', false, false, false)], format);
      assert.deepEqual(opts, {run: 'hide-layers=a,b', record: 'hide-layers=a,b'});
    });

    it('records nothing when a change takes back the run\'s changes', function () {
      var opts = getFrameVisibilityOptions([member('a', false, true, false), member('b', false, false, false)], format);
      assert.deepEqual(opts, {run: 'show-layers=a', record: ''});
    });

    it('records only the change from the start when a layer goes back', function () {
      // a was hidden earlier in the run and is shown again; b stays hidden
      var opts = getFrameVisibilityOptions([member('a', false, true, false), member('b', false, true, true),
        member('c', true, true, true)], format);
      assert.deepEqual(opts, {run: 'hide-layers=b show-layers=a', record: 'hide-layers=b'});
    });

    it('lists every layer as *', function () {
      var opts = getFrameVisibilityOptions([member('a', false, false, true), member('b', false, false, true)], format);
      assert.deepEqual(opts, {run: 'hide-layers=*', record: 'hide-layers=*'});
    });

    it('formats the list of layers', function () {
      var opts = getFrameVisibilityOptions([member('two words', false, false, true), member('b', false, false, false)], format);
      assert.equal(opts.record, 'hide-layers="two words"');
    });

    it('has nothing to run when nothing changes', function () {
      var opts = getFrameVisibilityOptions([member('a', true, true, true)], format);
      assert.deepEqual(opts, {run: '', record: ''});
    });
  });
});
