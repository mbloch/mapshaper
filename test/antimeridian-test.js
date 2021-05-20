
import { splitPathAtAntimeridian } from '../src/geom/mapshaper-antimeridian';
var assert = require('assert');

describe('mapshaper-antimeridian.js', function () {

  describe('splitPathAtAntimeridian()', function () {

    it('ring is split, starts away from antimeridian', function () {
      var input = [[-179, 1], [-179, -1], [179, -1], [179, 1], [-179, 1]];
      var expect = [
        [[-180, 1], [-179, 1], [-179, -1], [-180, -1]],
        [[180, -1], [179, -1], [179, 1], [180, 1]]];
      assert.deepEqual(splitPathAtAntimeridian(input), expect);
    })

    it('ring is split, starts on antimeridian 1', function () {
      var input = [[-180, 1], [-179, 0], [-180, -1], [179, 0], [-180, 1]];
      var expect = [
        [[-180, 1], [-179, 0], [-180, -1]],
        [[180, -1], [179, 0], [180, 1]]];
      assert.deepEqual(splitPathAtAntimeridian(input), expect);
    })

    it('ring is split, starts on antimeridian 2', function() {
      var input = [[180, 1], [-179, 0], [-180, -1], [179, 0], [180, 1]];
      var expect = [
        [[-180, 1], [-179, 0], [-180, -1]],
        [[180, -1], [179, 0], [180, 1]]];
      assert.deepEqual(splitPathAtAntimeridian(input), expect);
    })

    it('ring touches antimeridian once at first vertex', function() {
      var input = [[180, 0], [179, -1], [179, 1], [180, 0]];
      var expect = [[[180, 0], [179, -1], [179, 1], [180, 0]]];
      assert.deepEqual(splitPathAtAntimeridian(input), expect);
    })

    it ('ring touches antimeridian once at first vertex 2', function() {
      var input = [[-180, 0], [179, -1], [179, 1], [-180, 0]];
      var expect = [[[180, 0], [179, -1], [179, 1], [180, 0]]];
      assert.deepEqual(splitPathAtAntimeridian(input), expect);
    })

    it ('ring touches antimeridian once in middle', function() {
      var input = [[179, 1], [180, 0], [179, -1], [179, 1]];
      var expect = [[[179, 1], [180, 0], [179, -1], [179, 1]]];
      assert.deepEqual(splitPathAtAntimeridian(input), expect);
    })

    it ('ring touches antimeridian once in middle 2', function() {
      var input = [[179, 1], [-180, 0], [179, -1], [179, 1]];
      // var expect = [[[179, 1], [180, 0], [179, -1], [179, 1]]];
      var expect = [[[180, 0], [179, -1], [179, 1], [180, 0]]];
      assert.deepEqual(splitPathAtAntimeridian(input), expect);
    })

    // TODO
    it ('ring contains a segment that parallels the antimeridian', function() {
      // var input = [[180, 1],
    })

  })


})