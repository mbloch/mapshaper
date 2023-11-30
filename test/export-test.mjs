import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

describe('mapshaper-export.js', function () {

  describe('Issue: merging datasets for output should not modify the original datasets', function() {
    it('svg output from two datasets', function(done) {
      var box = {
        type: 'Polygon',
        coordinates: [[[1, 0], [0, 1], [1, 2], [2, 1], [1, 0]]]
      };
      api.applyCommands('-i box.json -rectangle source=box -o target=box,rectangle merged.svg -o format=geojson target=rectangle gj2008 -o format=geojson target=box gj2008', {'box.json': box}, function(e, output) {
        var box = JSON.parse(output['box.json']).geometries[0];
        var shape = JSON.parse(output['rectangle.json']).geometries[0];
        assert(output['merged.svg'].length > 0);
        assert.deepEqual(box.coordinates, [[[1, 0], [0, 1], [1, 2], [2, 1], [1, 0]]]);
        assert.deepEqual(shape.coordinates, [[[0,0],[0,2],[2,2],[2,0],[0,0]]])
        done();
      })
    });
  });

  describe('Issue: output should not rename original layers', function () {
    it('unnamed layers, csv output', function (done) {
      var lyr1 = {
        data: new internal.DataTable([{foo: 'bar'}])
      };
      var lyr2 = {
        data: new internal.DataTable([{foo: 'bar'}])
      };
      var dataset = {
        info: {},
        layers: [lyr1, lyr2]
      };
      // var catalog = new internal.Catalog().addDataset(dataset);
      var job = new internal.Job();
      job.catalog.addDataset(dataset);
      var commands = [{name: 'o', options: {
        dry_run: true,
        format: 'dsv'
      }}];
      internal.runParsedCommands(commands, job, function(err, output) {
        assert.equal(lyr1.name, undefined);
        assert.equal(lyr2.name, undefined);
        done();
      });
    })
  })

  describe('formatVersionedFileName()', function () {
    it('tests', function () {
      assert.equal(internal.formatVersionedFileName('data.json', 1), 'data1.json')
      assert.equal(internal.formatVersionedFileName('data2.shp', 0), 'data2-0.shp')
    })
  })

  describe('formatVersionedName()', function () {
    it('tests', function () {
      assert.equal(internal.formatVersionedFileName('counties', 1), 'counties1')
      assert.equal(internal.formatVersionedFileName('', 0), '0')
    })
  })

  describe('assignUniqueFileNames()', function () {
    it('test', function () {
      var files = [{filename: 'output.json'}, {filename: 'output.json'}];
      internal.assignUniqueFileNames(files);
      assert.deepEqual(files, [{filename: 'output1.json'}, {filename: 'output2.json'}])
    })
  })

  describe('assignUniqueLayerNames()', function () {
    it('layer names ending in a number', function () {
      var layers = [{
        name: 'nabes2'
      }, {
        name: 'nabes2'
      }];
      internal.assignUniqueLayerNames(layers);
      assert.deepEqual(layers, [{name: 'nabes2-1'}, {name: 'nabes2-2'}]);
    })
    it('typical layer names', function () {
      var layers = [{
        name: 'states'
      }, {
        name: 'states'
      }, {
        name: 'counties'
      }, {
        name: 'states'
      }];
      internal.assignUniqueLayerNames(layers);
      assert.deepEqual(layers, [{name: 'states1'}, {name: 'states2'}, {name: 'counties'}, {name: 'states3'}]);
    })
  })

});