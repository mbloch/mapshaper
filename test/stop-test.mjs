import api from '../mapshaper.js';
import assert from 'assert';

describe('mapshaper-stop.js', function () {
  it ('test bare -stop', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -stop -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      assert(!err);
      assert.deepEqual(Object.keys(out), []);
      done();
    });
  });

  it ('test -stop in -if statement', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -if 'empty' -stop -endif -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      assert(!err);
      assert.deepEqual(Object.keys(out), ['data.json']);
      done();
    });
  });

  it ('test -stop in -else statement', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-i data.json -if 'empty' -else -stop -endif -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      assert(!err);
      assert.deepEqual(Object.keys(out), []);
      done();
    });
  });

  it ('test -stop before -i', function(done) {
    var data = [{name: 'a'}, {name: 'b'}];
    var cmd = `-if '!file_exists("adgoiuahg.json")' -stop -endif -i data.json -o`;
    api.applyCommands(cmd, {'data.json': data}, function(err, out) {
      assert(!err);
      assert.deepEqual(Object.keys(out), []);
      done();
    });
  });


})
