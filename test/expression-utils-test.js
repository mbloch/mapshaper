
var assert = require('assert');
var api = require("..");

describe('mapshaper-expression-utils.js', function() {

  describe('round()', function() {

    it ('test 1', function(done) {
      var data = [{a: 100.1}, {a: 0.5}, {a: -2.001}];
      var target = [{a: 100.1, b: 100, c: 100.1}, {a: 0.5, b: 1, c: 0.5}, {a: -2.001, b: -2, c: -2}];
      api.applyCommands('-i a.json -each "b=round(a), c=_.round(a, 1)" -o', {'a.json': data}, function(err, output) {
        assert.deepEqual(JSON.parse(output['a.json']), target);
        done();
      });
    });
  });

  describe('sprintf()', function() {

    it ('test 1', function(done) {
      var data = 'a,b\n3000,3.001'
      var target = 'a,b,c\n3000,3.001,"3,000 3.0"';
      api.applyCommands('-i data.csv -each "c = sprintf(\'%,d %.1f\', a, b)" -o', {'data.csv': data}, function(err, output) {
        assert.equal(output['data.csv'], target);
        done();
      });
    });
  });

});
