import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;

describe('mapshaper-external.js registerCommand()', function () {

  it('-foo command, no options', function(done) {
    api.cmd.registerCommand('foo', {
      target: 'layer',
      command: function(lyr, dataset, opts) {
        // command changes name of layer to 'foo'
        lyr.name = 'foo';
      }
    });
    var data = {
      type: 'Point',
      coordinates: [1, 1]
    };
    api.applyCommands('-i data.json -foo -o', {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['foo.json']);
      assert.deepEqual(json.geometries[0], data);
      done();
    });
  });

  it('register -bar command with a string option and a flag option', function(done) {
    api.cmd.registerCommand('bar', {
      target: 'layer',
      options: [{name: 'name', DEFAULT: true}, {name: 'rename', type: 'flag'}],
      command: function(lyr, dataset, opts) {
        // command changes name of layer to 'foo'
        if (opts.rename) {
          lyr.name = opts.name;
        }
      }
    });
    var data = {
      type: 'Point',
      coordinates: [1, 1]
    };
    api.applyCommands('-i data.json -bar rename barz -o', {'data.json': data}, function(err, out) {
      var json = JSON.parse(out['barz.json']);
      assert.deepEqual(json.geometries[0], data);
      done();
    });
  });

  it('register -baz command with multiple layers as target', function(done) {
    var a = {type: 'Point', coordinates: [1,1]},
        b = {type: 'Point', coordinates: [2,2]},
        cmd = "-i a.json b.json combine-files -baz -o"

    api.cmd.registerCommand('baz', {
      target: 'layers',
      command: function(layers, dataset, opts) {
        // command assigns names with sequential numbers
        layers.forEach(function(lyr, i) {
          lyr.name = 'baz' + (i + 1);
        });
      }
    });
    api.applyCommands(cmd, {'a.json': a, 'b.json': b}, function(err, out) {
      var baz1 = JSON.parse(out['baz1.json']);
      var baz2 = JSON.parse(out['baz2.json']);
      assert.deepEqual(baz1.geometries[0], a);
      assert.deepEqual(baz2.geometries[0], b);
      done();
    });
  })
});
