import assert from 'assert';
import api from '../mapshaper.js';

var Bounds = api.internal.Bounds;

describe('mapshaper-frame.js', function () {

  describe('getAspectRatioArg()', function() {
    it('works with height range', function() {
      var out = api.internal.getAspectRatioArg('4', '1,2');
      assert.equal(out, '2,4');
    });
  });

  describe('getFrameSize()', function () {
    it('works with pixels option', function () {
      var bounds = new Bounds(0, 0, 4, 2);
      var opts = {
        pixels: 200
      };
      var out = api.internal.getFrameSize(bounds, opts);
      assert.deepEqual(out, [20, 10]);
    })
  })
});
