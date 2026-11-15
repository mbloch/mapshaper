import assert from 'assert';
import { EventDispatcher } from '../src/gui/gui-events';

describe('gui-events.mjs', function () {
  describe('EventDispatcher', function () {
    it('calls handlers in priority order, higher first', function () {
      var d = new EventDispatcher();
      var calls = [];
      d.on('x', function() { calls.push('a'); });
      d.on('x', function() { calls.push('c'); }, null, -1);
      d.on('x', function() { calls.push('b'); }, null, 1);
      d.dispatchEvent('x');
      assert.deepEqual(calls, ['b', 'a', 'c']);
    });

    it('a listener added during a dispatch does not push later handlers out of it', function () {
      var d = new EventDispatcher();
      var calls = [];
      d.on('x', function() {
        calls.push('first');
        d.on('y', function() {});
      }, null, 10);
      d.on('x', function() { calls.push('last'); }, null, -10);
      d.dispatchEvent('x');
      assert.deepEqual(calls, ['first', 'last']);
    });

    it('a higher-priority listener added during a dispatch does not rerun the current one', function () {
      var d = new EventDispatcher();
      var calls = [];
      var added = false;
      d.on('x', function() {
        calls.push('a');
        if (!added) {
          added = true;
          d.on('x', function() { calls.push('new'); }, null, 10);
        }
      });
      d.on('x', function() { calls.push('z'); }, null, -1);
      d.dispatchEvent('x');
      assert.deepEqual(calls, ['a', 'z']);
      d.dispatchEvent('x');
      assert.deepEqual(calls, ['a', 'z', 'new', 'a', 'z']);
    });
  });
});
