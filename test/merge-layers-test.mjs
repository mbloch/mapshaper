import assert from 'assert';
import api from '../mapshaper.js';

var internal = api.internal;

describe('mapshaper-merge-layers.js', function () {

  describe('-merge-layers command', function() {
    describe('flatten option', function(done) {
      var a = {
        type: 'Feature',
        properties: {id: "a"},
        geometry: {
          type: 'Polygon',
          coordinates: [[[0,0], [0,1], [2, 1], [2,0], [0,0]]]
        }
      }
      var b = {
        type: 'Feature',
        properties: {id: 'b'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[1,0], [1,1], [2,1], [2,0], [1,0]]]
        }
      };
      it('test 1', function(done) {
        var cmd = '-i a.json b.json combine-files -merge-layers flatten name=merged -o';
        api.applyCommands(cmd, {'a.json': a, 'b.json': b}, function(err, out) {
          var json = JSON.parse(out['merged.json']);
          assert.deepEqual(json.features[0].properties, {id: 'a'})
          assert.deepEqual(json.features[1].properties, {id: 'b'})
          done();
        });
      });

      it('test 2', function(done) {
        // a causes b to be removed
        var cmd = '-i b.json a.json combine-files -merge-layers flatten name=merged -o';
        api.applyCommands(cmd, {'a.json': a, 'b.json': b}, function(err, out) {
          var json = JSON.parse(out['merged.json']);
          assert.equal(json.features.length, 1);
          assert.deepEqual(json.features[0].properties, {id: 'a'})
          done();
        });
      });

    });

    it('handles combination of shape + non-shape layers', function(done) {
      // a has a shape and no properties, b has properties and no shape
      var a = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Point',
          coordinates: [0, 0]
        }]
      };
      var b = 'a,b\n1,2';
      var cmd = '-i a.json b.csv combine-files -merge-layers force -o c.json';
      api.applyCommands(cmd, {'a.json': a, 'b.csv': b}, function(err, out) {
        var json = JSON.parse(out['c.json']);
        assert.deepEqual(json, {
          type: "FeatureCollection",
          features: [{
            type: 'Feature',
            properties: {},  // a, b are given undefined values internally, which are not included in GeoJSON export
            geometry: {
              type: 'Point',
              coordinates: [0, 0]
            }
          }, {
            type: 'Feature',
            properties: {a: 1, b: 2},
            geometry: null
          }]
        })
        done();
      });


    });

    it('handles empty layers', function(done) {
      var a = 'id\n1',
          b = 'id\n2',
          c = 'id\n3',
          d = 'id\n4';
      var cmd = '-i a.csv -filter false -i b.csv c.csv combine-files -i d.csv -merge-layers target=* -o out.csv';
      var data = {'a.csv': a, 'b.csv': b, 'c.csv': c, 'd.csv': d};
      api.applyCommands(cmd, data, function(err, out) {
        assert.equal(out['out.csv'], 'id\n2\n3\n4');
        done();
      });


    });

    it('force flag works', function(done) {
      var a = 'id\na';
      var b = 'ID\nb';
      api.applyCommands('a.csv b.csv combine-files -merge-layers target=* force -o c.csv', {'a.csv': a, 'b.csv': b}, function(err, out) {
        var c = out['c.csv'];
        assert.equal(c, 'id,ID\na,\n,b');
        done();
      });

    });

    it('supports merging layers from multiple datasets', function(done) {
      var a = 'FIPS\n36',
          b = 'FIPS\n34',
          c = 'FIPS\n52',
          // merge two of three datasets
          cmd = '-i a.csv -i b.csv -i c.csv -merge-layers target=b,c name=bc -o target=*';
      api.applyCommands(cmd, {'a.csv': a, 'b.csv': b, 'c.csv': c}, function(err, out) {
        var a = out['a.csv'],
            bc = out['bc.csv'];
        assert.deepEqual(Object.keys(out).sort(), ['a.csv', 'bc.csv']);
        assert.equal(a, 'FIPS\n36');
        assert.equal(bc, 'FIPS\n34\n52');
        done();
      });
    });

    it('supports merging layers from multiple datasets 2', function(done) {
      var a = 'FIPS\n36',
          b = 'FIPS\n34',
          c = 'FIPS\n52',
          // test that default target after merge is the merged layer
          cmd = '-i a.csv b.csv combine-files -i c.csv -merge-layers target=b,c name=bc -each \'FIPS=null\' -o target=*';
      api.applyCommands(cmd, {'a.csv': a, 'b.csv': b, 'c.csv': c}, function(err, out) {
        var a = out['a.csv'],
            bc = out['bc.csv'];
        assert.deepEqual(Object.keys(out).sort(), ['a.csv', 'bc.csv']);
        assert.equal(a, 'FIPS\n36');
        assert.equal(bc, 'FIPS\n\n');
        done();
      });
    });

    it('supports merging layers from multiple datasets 3', function(done) {
      var a = 'FIPS\n36',
          b = 'FIPS\n34',
          c = 'FIPS\n52',
          // merge all datasets
          cmd = '-i a.csv -i b.csv -i c.csv -merge-layers target=* name=abc -o target=*';
      api.applyCommands(cmd, {'a.csv': a, 'b.csv': b, 'c.csv': c}, function(err, out) {
        var abc = out['abc.csv'];
        assert.deepEqual(Object.keys(out), ['abc.csv']);
        assert.equal(abc, 'FIPS\n36\n34\n52');
        done();
      });
    });


    it('identifies shared topology between layers', function(done) {

      var line = {
        type: 'LineString',
        coordinates: [[0, 0], [1, 1], [2, 2]]
      };
      var target = {
        type: 'Topology',
        arcs: [[[0, 0], [1, 1], [2, 2]]],
        objects: {layer: {
          type: 'GeometryCollection',
          geometries: [{
            type: 'LineString',
            arcs: [0]
          },{
            type: 'LineString',
            arcs: [0]
          }]
        }}
      };
      var cmd = '-i a.json -i b.json -merge-layers target=a,b -o ab.json format=topojson no-quantization';
      api.applyCommands(cmd, {'a.json': line, 'b.json': line}, function(err, output) {
        var json = JSON.parse(output['ab.json']);
        assert.deepEqual(json, target);
        done();
      });
    })

  })

  describe('mergeLayers()', function () {
    it('merging a single layer returns reference to original layer', function() {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var merged = api.cmd.mergeLayers([lyr1]);
      assert.strictEqual(merged[0], lyr1);
    })


    it('compatible layers are merged', function () {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var lyr2 = {
        geometry_type: "point",
        shapes: [[[4, 3]]],
        data: new internal.DataTable([{a: 7}])
      };
      var merged = api.cmd.mergeLayers([lyr1, lyr2]);
      assert.deepEqual(merged[0].data.getRecords(), [{a: 9}, {a: 8}, {a: 7}]);
      assert.deepEqual(merged[0].shapes, [[[0, 1]], [[2, 1]], [[4, 3]]]);
      assert.equal(merged[0].geometry_type, 'point');
    })

    it('layers with incompatible geometries are not merged', function (done) {
      var lyr1 = {
        type: 'MultiPoint',
        coordinates: [[0, 1], [2, 1]]
      };
      var lyr2 = {
        type: 'LineString',
        coordinates: [[0, 0], [1, 1], [2, 0]]
      };
      var cmd = '-i point.json -i line.json -merge-layers force target=* -o';
      api.applyCommands(cmd, {'point.json': lyr1, 'line.json': lyr2}, function(err, out) {
        assert(err.message.indexOf('Incompatible geometry types') > -1);
        done();
      })
    })

    it('a point layer and a null geometry layer can be merged', function () {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var lyr2 = {
        data: new internal.DataTable([{a: 7}])
      };
      var merged = api.cmd.mergeLayers([lyr1, lyr2]);
      assert.deepEqual(merged[0].shapes,[[[0, 1]], [[2, 1]], null])

    })

    it('layers with only geometry are merged', function() {
      var lyr1 = {
        name: 'a',
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]]
      };
      var lyr2 = {
        name: 'b',
        geometry_type: "point",
        shapes: [[[4, 3]]]
      };
      var merged = api.cmd.mergeLayers([lyr1, lyr2]);
      assert.deepEqual(merged[0], {
        name: '',
        geometry_type: 'point',
        shapes: [[[0, 1]], [[2, 1]], [[4, 3]]],
        data: null
      });
    });

    it('layers with only data are merged', function () {
      var lyr1 = {
        data: new internal.DataTable([{a: 9, b: ''}, {b: 'b', a: 8}])
      };
      var lyr2 = {
        data: new internal.DataTable([{a: 7, b: 'w'}])
      };
      var lyr3 = {
        data: new internal.DataTable([{b: 'e', a: 7}])
      };
      var merged = api.cmd.mergeLayers([lyr1, lyr2, lyr3]);
      assert.deepEqual(merged[0].data.getRecords(), [{a: 9, b: ''}, {b: 'b', a: 8},
        {a: 7, b: 'w'}, {b: 'e', a: 7}]);
      assert.equal(merged.length, 1);

    })

    it('layers with incompatible data types are not merged', function() {
      var lyr1 = {
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var lyr2 = {
        data: new internal.DataTable([{a: '9'}])
      };
      assert.throws(function() {
        api.cmd.mergeLayers([lyr1, lyr2]);
      })
    })

    it('layers with inconsistent fields are not merged', function () {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var lyr2 = {
        geometry_type: "point",
        shapes: [[[4, 3]]],
        data: new internal.DataTable([{a: 7, b: 0}])
      };
      assert.throws(function() {
        var merged = api.cmd.mergeLayers([lyr1, lyr2]);
      })
    })

    it('layers with inconsistent fields are merged if force-merging', function () {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: new internal.DataTable([{a: 9}, {a: 8}])
      };
      var lyr2 = {
        geometry_type: "point",
        shapes: [[[4, 3]]],
        data: new internal.DataTable([{a: 7, b: 0}])
      };
      var merged = api.cmd.mergeLayers([lyr1, lyr2], {force: true})[0].data.getRecords();
      assert.deepEqual(merged, [{a: 9, b: undefined}, {a: 8, b: undefined}, {a: 7, b: 0}]);
      assert.strictEqual(merged[0].b, undefined);
    })

    it('force-merging allows layers with no data to be merged', function () {
      var lyr1 = {
        geometry_type: "point",
        shapes: [[[0, 1]], [[2, 1]]],
        data: null
      };
      var lyr2 = {
        geometry_type: "point",
        shapes: [[[4, 3]]],
        data: new internal.DataTable([{a: 7, b: 0}])
      };
      var merged = api.cmd.mergeLayers([lyr1, lyr2], {force: true})[0].data.getRecords();
      assert.deepEqual(merged, [{a: undefined, b: undefined}, {a: undefined, b: undefined}, {a: 7, b: 0}]);
    })
  })

})
