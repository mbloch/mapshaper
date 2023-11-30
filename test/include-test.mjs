import api from '../mapshaper.js';
import assert from 'assert';



describe('mapshaper-include.js', function () {
  describe('-include command', function () {
    // TODO: test importing keys that are not valid JS variable names

    it('JS unable to modify program scope', function(done) {
      var js = '{ \
        _internal: typeof internal, \
        _this: this, \
        _require: typeof require, \
        _global: typeof global \
      }';
      var input = [{}];
      var cmd = '-i data.json -include include.js -each "a = _internal, b = _this, c = _require, d = _global" -o';
      api.applyCommands(cmd, {'data.json': input, 'include.js': js}, function(err, out) {
        assert.deepEqual(JSON.parse(out['data.json']), [{a: 'undefined', b: {}, c: 'function', d: 'undefined'}])
        done();
      });

    });

    it('imports data and functions from JS string', function (done) {
      var o = "{ \
        foo: 'bar', \
        getA: function(rec) {return rec.a} \
      }";
      var input = [{a: 1}, {a: 2}];
      var cmd = '-i in.json -include in.js -each "b = foo + this.id, c = getA(this.properties)" -o out.json';
      api.applyCommands(cmd, {'in.json': input, 'in.js': o}, function(err, out) {
        assert.deepEqual(JSON.parse(out['out.json']), [
          {a: 1, b: 'bar0', c: 1},
          {a: 2, b: 'bar1', c: 2}])
        done();
      })
    })

    it('can be used as an accumulator', function (done) {
      var o = "{counts: {}}";
      var input = [{type: 'foo'}, {type: 'foo'}, {type: 'foo'}, {type: 'bar'}];
      var cmd = '-i in.json -include in.js -each "counts[type] = type in counts ? counts[type] + 1 : 1" -each "count = counts[type]" -o out.json';
      api.applyCommands(cmd, {'in.json': input, 'in.js': o}, function(err, out) {
        assert.deepEqual(JSON.parse(out['out.json']), [{type: 'foo', count: 3},
              {type: 'foo', count: 3}, {type: 'foo', count: 3}, {type: 'bar', count: 1}]);
        done();
      })
    })

    it('can come first in command string; values cover existing fields', function(done) {
      var o = {a: 'b'};
      var input = [{}];
      var cmd = '-include in.js -i data.json -each "this.properties.a = a" -o';
      api.applyCommands(cmd, {'in.js': o, 'data.json': input}, function(err, out) {
        assert.deepEqual(JSON.parse(out['data.json']), [{a: 'b'}]);
        done();
      });
    });

    it('can require node modules', function(done) {
      var o = '{\
        _: require("underscore"),\
        testNull: function(val) {return this._.isNull(val)}\
      }';
      var data = [{a: null}, {a: 'apple'}];
      var cmd = '-i data.json -include includes.js -each "empty = testNull(a), empty2 = _.isNull(a)" -o';
      var expect = [{a: null, empty: true, empty2: true}, {a: 'apple', empty: false, empty2: false}];
      api.applyCommands(cmd, {'data.json': data, 'includes.js': o}, function(err, out) {
        assert.deepEqual(JSON.parse(out['data.json']), expect);
        done();
      });
    });
  })
})