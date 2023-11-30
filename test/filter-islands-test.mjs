import assert from 'assert';
import api from '../mapshaper.js';


describe('mapshaper-filter-islands.js', function () {


  it ('-filter-islands should not remove donut-hole polygons', function(done) {
    //       e
    //      / \
    //     /   \
    //    /  a  \
    //   /  / \  \
    //  h  d   b  f
    //   \  \ /  /
    //    \  c  /
    //     \   /
    //      \ /
    //       g
    //
    //   abcda, efghe
    //   0,     1
    var arcs = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
        [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];
    var topojson = JSON.stringify({
      type: "Topology",
      arcs: arcs,
      objects: {
        layer1: {
          type: "GeometryCollection",
          geometries: [{
            type: "Polygon",
            arcs: [[0]]
          }, {
            type: "Polygon",
            arcs: [[1], [-1]]
          }]
        }
      }
    });
    // var cmd = '-filter-islands min-vertices=10 -o no-quantization';
    var cmd = '-filter-islands min-area=1e13 -o no-quantization';
    api.applyCommands(cmd, topojson, function(err, output) {
      assert.deepEqual(JSON.parse(output), JSON.parse(topojson));
      done();
    });
  });

  describe('Command line tests', function() {
    var geojson = JSON.stringify({
      type:"FeatureCollection",
      features: [{
        type: 'Feature',
        properties: {name: 'a'},
        geometry: {
          type: "MultiPolygon",
          coordinates: [[[[1, 100], [1, 200], [2, 200], [2, 100], [1, 100]]],
              [[[1, 1], [1, 2], [2, 1], [1, 1]]]]
        }
      }, {
        type: 'Feature',
        properties: {name: 'b'},
        geometry: null
      }]
    });

    it ('-filter-islands remove-empty', function(done) {
      api.applyCommands('-filter-islands min-area=0.5 remove-empty -o gj2008', geojson, function(err, json) {
        var output = JSON.parse(json);
        assert.equal(output.features.length, 1);
        assert.deepEqual(output.features[0],
          JSON.parse(geojson).features[0])
        done();
      });
    })

    it ('-filter-islands min-area=', function(done) {
      var target = {
        type: 'Polygon',
        coordinates: [[[1, 100], [1, 200], [2, 200], [2, 100], [1, 100]]]
      };
      api.applyCommands('-filter-islands min-area=1 -o gj2008', geojson, function(err, json) {
        var output = JSON.parse(json);
        assert.equal(output.features.length, 2);
        assert.deepEqual(output.features[0].geometry, target);
        done();
      });
    })

    it ('-filter-islands min-vertices=', function(done) {
      var target = {
        type: 'Polygon',
        coordinates: [[[1, 100], [1, 200], [2, 200], [2, 100], [1, 100]]]
      };
      api.applyCommands('-filter-islands min-vertices=4 -o gj2008', geojson, function(err, json) {
        var output = JSON.parse(json);
        assert.equal(output.features.length, 2);
        assert.deepEqual(output.features[0].geometry, target);
        done();
      });
    })

    it ('-filter-islands (combined options)', function(done) {
      api.applyCommands('-filter-islands remove-empty min-vertices=8 -o gj2008', geojson, function(err, json) {
        var output = JSON.parse(json);
        var target = {type: 'GeometryCollection', geometries: []}; // empty output
        assert.deepEqual(output, target);
        done();
      });
    })

  })

})