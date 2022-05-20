
import {
  splitPathAtAntimeridian,
  removeCutSegments } from '../src/geom/mapshaper-antimeridian-cuts';
import assert from 'assert';


describe('mapshaper-antimeridian-cuts.js', function () {

  describe('removeCutSegments()', function() {

    it('remove polar line', function() {
      var coords = [[-180,80], [-180,90], [0,90], [180,90], [180, 80], [-180, 80]];
      var output = removeCutSegments(coords);
      var target = [[-180, 80], [180, 80], [-180, 80]];
      assert.deepEqual(output, target);
    });

    it('remove vertices along edge', function() {
      var coords = [[-180,80], [-180,70], [-180,60], [180,60], [180, 70],
        [180,80], [-180,80]];
        var output = removeCutSegments(coords);
        var target = [[-180,80], [-180,60], [180,60], [180,80], [-180,80]];
        assert.deepEqual(output, target);
    })

    // it('remove vertices across array boundary', function() {
    //   var coords = [[0,90], [90, 90], [180,90], [180, 80], [-180, 80],[-180,90], [-90, 90], [0,90]];
    //   var output = removeCutSegments(coords);
    //   var target = [[-180, 80], [180, 80], [-180, 80]];
    //   assert.deepEqual(output, target);
    // })


  })

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