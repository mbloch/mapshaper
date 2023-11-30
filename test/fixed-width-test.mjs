
import {parseFixedWidthInfo} from '../src/text/mapshaper-fixed-width';
import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-fixed-width.js', function () {
  describe('-o tests', function() {
    it ('simple test', function(done) {
      var input = 'color,number\nred,10    \ncrimson,0     ';
      var cmd = '-i data.csv -o format=dsv delimiter=" "';
      api.applyCommands(cmd, {'data.csv': input}, function(err, out) {
        var expect = 'color   number\nred     10    \ncrimson 0     ';
        assert.equal(out['data.txt'], expect);
        done();
      });
    });
  });

  describe('parseFixedWidthInfo()', function() {
    it('simple test', function() {
      var str = 'name color\nfoo  red  ';
      var output = parseFixedWidthInfo(str);
      var expect = [{name: 'name', start: 0, end: 4}, {name: 'color', start: 5, end: undefined}];
      assert.deepEqual(output, expect);
    })

    it('simple test 2', function() {
      var str = 'name    color\nfoo bar red  ';
      var output = parseFixedWidthInfo(str);
      var expect = [{name: 'name', start: 0, end: 7}, {name: 'color', start: 8, end: undefined}];
      assert.deepEqual(output, expect);
    })

    it('uneven last field length', function() {
      var str = 'name color\nfoo  red red red';
      var output = parseFixedWidthInfo(str);
      var expect = [{name: 'name', start: 0, end: 4}, {name: 'color', start: 5, end: undefined}];
      assert.deepEqual(output, expect);
    })

    it('uneven last field length 2', function() {
      var str = 'name color\nfoo  red';
      var output = parseFixedWidthInfo(str);
      var expect = [{name: 'name', start: 0, end: 4}, {name: 'color', start: 5, end: undefined}];
      assert.deepEqual(output, expect);
    })

  });
})
