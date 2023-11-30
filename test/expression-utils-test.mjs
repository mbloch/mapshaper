import {interpolated_median} from '../src/expressions/mapshaper-expression-utils';
import assert from 'assert';
import api from '../mapshaper.js';

describe('mapshaper-expression-utils.js', function() {

  describe('round()', function() {

    it ('test 1', function(done) {
      var data = [{a: 100.1}, {a: 0.5}, {a: -2.001}, {a: null}];
      var target = [{a: 100.1, b: 100, c: 100.1}, {a: 0.5, b: 1, c: 0.5}, {a: -2.001, b: -2, c: -2}, {a: null, b: null, c: null}];
      api.applyCommands('-i a.json -each "b=round(a), c=_.round(a, 1)" -o', {'a.json': data}, function(err, output) {
        assert.deepStrictEqual(JSON.parse(output['a.json']), target);
        done();
      });
    });
  });

  describe('int_median()', function() {
    var data = [{
      counts: [3,3]
    }, {
      counts: [0,0]
    }];

    it ('test 1', function(done) {
      api.applyCommands('-i data.json -each "med=int_median(counts, [0,10,20])" -o', {'data.json': data}, function(err, output) {
        var data = JSON.parse(output['data.json']);
        assert.equal(data[0].med, 10);
        assert.strictEqual(data[1].med, null);
        done();
      });
    });

    it('test 2', function() {
      var counts = [2, 2, 2];
      var values = [10,20,30,40];
      var median = interpolated_median(counts, values);
      assert.equal(median, 25);
    })
  })

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
