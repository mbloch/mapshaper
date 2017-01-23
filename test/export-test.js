var api = require('../'),
  assert = require('assert'),
  internal = api.internal;

describe('mapshaper-export.js', function () {

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
      var catalog = new internal.Catalog().addDataset(dataset);
      var commands = [{name: 'o', options: {
        dry_run: true,
        format: 'dsv'
      }}];
      internal.runParsedCommands(commands, catalog, function(err, output) {
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