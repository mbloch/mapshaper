var api = require('../'),
  assert = require('assert');

describe('mapshaper-classify.js', function () {

  it('error on unknown color scheme', function(done) {
    var data='value\n1\n2\n3\n4';
    api.applyCommands('-i data.csv -classify value colors=blues -o', {'data.csv': data}, function(err, out) {
      assert(err.message.includes('Unsupported color'));
      done();
    });
  });

  it('color= option accepts a color scheme name', function(done) {
    var data='value\n1\n2\n3\n4';
    api.applyCommands('-i data.csv -classify value colors=Blues -o format=json', {'data.csv': data}, function(err, out) {
      var data = JSON.parse(out['data.json']);
      assert('fill' in data[0]);
      done();
    });
  })


});