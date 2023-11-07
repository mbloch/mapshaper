
import { findArcIdFromVertexId } from '../src/paths/mapshaper-arc-utils';
import assert from 'assert';

describe('mapshaper-arc-utils', function () {

  describe('findArcIdFromVertexId()', function () {

    it('tests', function () {
      assert.equal(findArcIdFromVertexId(0, [0, 10]), 0);
      assert.equal(findArcIdFromVertexId(1, [0, 10]), 0);
      assert.equal(findArcIdFromVertexId(10, [0, 10]), 1);
      assert.equal(findArcIdFromVertexId(11, [0, 10]), 1);
    })

    it('tests 2', function () {
      assert.equal(findArcIdFromVertexId(0, [0]), 0);
      assert.equal(findArcIdFromVertexId(1, [0]), 0);
    })

    it('tests 3', function () {
      assert.equal(findArcIdFromVertexId(0, [0, 10, 10, 20, 30]), 0);
      assert.equal(findArcIdFromVertexId(3, [0, 10, 10, 20, 30]), 0);
      assert.equal(findArcIdFromVertexId(11, [0, 10, 10, 10, 30]), 3);
      assert.equal(findArcIdFromVertexId(30, [0, 10, 10, 20, 30]), 4);
      assert.equal(findArcIdFromVertexId(10, [0, 10, 10, 10, 10, 10, 10, 10]), 7);
      assert.equal(findArcIdFromVertexId(100, [0, 10, 10, 10, 10, 10, 10, 10]), 7);
    })
  })


})
