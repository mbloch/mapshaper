import assert from 'assert';
import api from '../mapshaper.js';


describe('mapshaper-simplify-fast.js', function () {

  it('"-points inner" converts collapsed polygon to null geometry', function () {
    var shp = [[[0]]];
    var arcs = new api.internal.ArcCollection([[[0, 0], [0, 0], [0, 0], [0, 0]]]);
    var simple = api.internal.simplifyPolygonFast(shp, arcs, 1);
    assert.equal(simple.shape, null);
  })

  it('"-points inner" converts collapsed polygon to null geometry 2', function () {
    var shp = [[[0]]];
    var arcs = new api.internal.ArcCollection([[[0, 0], [0, 1], [1, 0], [0, 0]]]);
    var simple = api.internal.simplifyPolygonFast(shp, arcs, 1);
    assert.equal(simple.shape, null);
  })


})
