import assert from 'assert';
import api from '../mapshaper.js';

var utils = api.utils;

describe("mapshaper-keep-shapes.js", function() {

  describe('Issue #228 -- island shapes not always preserved', function () {
    it('edge case: adding two points fails to inflate island', function (done) {
      var poly = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 1], [0.5, 0], [0, -1], [0, 0]]]
      }
      var expect = poly;
      var cmd = '-i poly.json -simplify keep-shapes dp 0% -o gj2008';
      api.applyCommands(cmd, {'poly.json': poly}, function(err, output) {
        var result = JSON.parse(output['poly.json']).geometries[0];
        assert.deepEqual(result, poly);
        done();
      });
    })

    it('edge case 2: collapsed shape has tiny positive area (to simulate rounding error)', function (done) {
      var poly = {
        type: 'Polygon',
        coordinates: [[[-1e-11, 0], [0, 1], [0.5, 0], [0, -1], [-1e-11, 0]]]
      }
      var expect = poly;
      var cmd = '-i poly.json -simplify keep-shapes dp 0% -o gj2008';
      api.applyCommands(cmd, {'poly.json': poly}, function(err, output) {
        var result = JSON.parse(output['poly.json']).geometries[0];
        assert.deepEqual(result, poly);
        done();
      });
    })
  })

  describe("#replaceInArray()", function() {
    var uu2, uu3, uu5;

    beforeEach(function() {
      uu3 = [Infinity, 23, Infinity];
      uu5 = [Infinity, 23, 43, 43, Infinity];
    })

    it("should replace a single occurence of a value", function() {
      api.internal.replaceInArray(uu3, 23, Infinity, 0, 2);
      assert.deepEqual(uu3, [Infinity, Infinity, Infinity]);
    })

    it("should replace multiple occurences of a value", function() {
      api.internal.replaceInArray(uu5, 43, Infinity, 0, 4);
      assert.deepEqual(uu5, [Infinity, 23, Infinity, Infinity, Infinity]);
    })
  })


  describe("#protectShape()", function() {
    it("ignores null or empty shape", function() {
      var arcs = new api.internal.ArcCollection([[[0, 0], [0, 1], [1, 1], [0, 0]]]);
      arcs.setThresholds([[Infinity, 1, 1, Infinity]]);
      assert.equal(api.internal.protectShape(arcs, null), undefined)
      assert.equal(api.internal.protectShape(arcs), undefined)
      assert.equal(api.internal.protectShape(arcs, []), undefined)
      assert.equal(api.internal.protectShape(arcs, [[]]), undefined)
      var data = arcs.getVertexData();
      assert.deepEqual(utils.toArray(data.zz), [Infinity, 1, 1, Infinity])
    })

    it("protects points in a single-part polygon", function() {
      var arcs = new api.internal.ArcCollection([[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]);
      arcs.setThresholds([[Infinity, 1, 2, 1, Infinity]]);
      assert.equal(api.internal.protectShape(arcs, [[0]]), undefined)
      var data = arcs.getVertexData();
      assert.deepEqual(utils.toArray(data.zz), [Infinity, Infinity, Infinity, Infinity, Infinity])
    })

    it("protects points in a single-part polygon, test2", function() {
      var arcs = new api.internal.ArcCollection([[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]);
      arcs.setThresholds([[Infinity, 2, 1, 2, Infinity]]);
      assert.equal(api.internal.protectShape(arcs, [[0]]), undefined)
      var data = arcs.getVertexData();
      assert.deepEqual(utils.toArray(data.zz), [Infinity, Infinity, 1, Infinity, Infinity])
    })

    it("protects largest ring in a multi-part polygon", function() {
      var arcs = new api.internal.ArcCollection([[[0, 0], [0, 1], [1, 1], [0, 0]],
        [[0, 0], [0, 1], [2, 1], [0, 0]]]);
      arcs.setThresholds([[Infinity, 1, 1, Infinity], [Infinity, 1, 1, Infinity]]);
      api.internal.protectShape(arcs, [[0], [1]])
      var data = arcs.getVertexData();
      assert.deepEqual(utils.toArray(data.zz), [Infinity, 1, 1, Infinity, Infinity, Infinity, Infinity, Infinity])
    })
  })
})
