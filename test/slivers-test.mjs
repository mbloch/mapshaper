import assert from 'assert';
import api from '../mapshaper.js';
import { ArcCollection } from '../src/paths/mapshaper-arcs';
import {
  applyDefaultGapWidthOpts,
  getDefaultGapWidth,
  getDefaultSliverThreshold,
  getGapWidthTest,
  getSliverTest
} from '../src/polygons/mapshaper-slivers';
var internal = api.internal;

describe('mapshaper-slivers.js', function () {
  describe('getSliverAreaFunction()', function () {
    it('higher strength -> lower effective area of a ring', function() {
      var geojson = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 2], [1, 2], [1, 0], [0, 0]]]
      };
      var dataset = internal.importGeoJSON(geojson, {});
      var a = internal.getSliverAreaFunction(dataset.arcs, 0);
      var b = internal.getSliverAreaFunction(dataset.arcs, 0.5);
      var c = internal.getSliverAreaFunction(dataset.arcs, 1);
      var ring = dataset.layers[0].shapes[0][0];
      assert(a(ring) > b(ring));
      assert(b(ring) > c(ring));
    })
  })

  describe('getDefaultGapWidth()', function () {
    it('equals sqrt(default area threshold / π)', function() {
      var arcs = new ArcCollection([
        [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]],
        [[0, 0], [0, 0.1], [20, 0.1], [20, 0], [0, 0]]
      ]);
      var lyr = {geometry_type: 'polygon', shapes: [[[0]], [[1]]]};
      var area = getDefaultSliverThreshold(lyr, arcs);
      assert.equal(getDefaultGapWidth(lyr, arcs), Math.sqrt(area / Math.PI));
    })
  })

  describe('getGapWidthTest() vs getSliverTest()', function () {
    it('matches sliver-control=1 when width is sqrt(A0 / π)', function() {
      var arcs = new ArcCollection([
        [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]],
        [[0, 0], [0, 0.1], [20, 0.1], [20, 0], [0, 0]],
        [[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]
      ]);
      var A0 = 5;
      var widthTest = getGapWidthTest(arcs, Math.sqrt(A0 / Math.PI));
      var areaTest = getSliverTest(arcs, A0, 1);
      [[0], [1], [2]].forEach(function(ring) {
        assert.equal(widthTest(ring), areaTest(ring),
          'ring ' + ring[0] + ' should get the same decision');
      });
    })
  })

  describe('applyDefaultGapWidthOpts()', function () {
    it('defaults to gap_width=auto', function() {
      assert.deepEqual(applyDefaultGapWidthOpts({}), {gap_width: 'auto'});
    })

    it('keeps an explicit gap-width', function() {
      assert.deepEqual(applyDefaultGapWidthOpts({gap_width: '2m'}),
        {gap_width: '2m'});
    })

    it('keeps legacy area options on the area path', function() {
      assert.deepEqual(applyDefaultGapWidthOpts({min_area: '100km2'}),
        {min_area: '100km2'});
      assert.deepEqual(applyDefaultGapWidthOpts({sliver_control: 1}),
        {sliver_control: 1, gap_fill_area: 'auto'});
    })
  })

})
