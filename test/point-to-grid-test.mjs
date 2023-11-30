
import { twoCircleIntersection } from '../src/grids/mapshaper-grid-utils';
import { getAlignedGridBounds, getCenteredGridBounds } from '../src/grids/mapshaper-square-grid';
import assert from 'assert';
import api from '../mapshaper.js';

describe('mapshaper-point-to-grid.js', function () {
  describe('-point-to-grid', function() {
    it('test 1', async function() {
      var points = 'x,y\n2,2\n3,3';
      var cmd = '-i data.csv -points -point-to-grid interval=1 -o out.json';
      var out = await api.applyCommands(cmd, {'data.csv': points});
      var geojson = JSON.parse(out['out.json']);
      assert.equal(geojson.features.length, 7);
    })
  });

  describe('getAlignedGridBounds()', function() {
    it('test 1', function() {
      var bbox = [-0.5, 0.5, 1, 1];
      var expect = [-2, -1, 2, 2];
      var out = getAlignedGridBounds(bbox, 1);
      assert.deepEqual(out, expect);
    });

    it('test 2', function() {
      var bbox = [-2, -2, 4, 4];
      var expect = [-4, -4, 6, 6];
      var out = getAlignedGridBounds(bbox, 2);
      assert.deepEqual(out, expect);
    });
  })

  describe('getCenteredGridBounds()', function() {
    it('test 1', function() {
      var bbox = [0.5, 0.5, 2, 2];
      var expect = [-0.75, -0.75, 3.25, 3.25];
      var out = getCenteredGridBounds(bbox, 1);
      assert.deepEqual(out, expect);
    });
  })

  describe('twoCircleIntersection()', function () {
    it('overlapping', function() {
      var area = twoCircleIntersection([30, 0], 15, [30, 0], 20);
      assert.equal(area, Math.PI * 15 * 15);
    })
    it('disjoint', function() {
      var area = twoCircleIntersection([0, 0], 15, [35, 0], 20);
      assert.equal(area, 0);
    })
  })

})
