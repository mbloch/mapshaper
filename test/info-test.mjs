import assert from 'assert';
import api from '../mapshaper.js';
import { formatTableValue } from '../src/commands/mapshaper-info';


describe('mapshaper-info.js', function () {
  describe('+ option', function() {
    it('simple table', async function() {
      var data = [{foo: 'bar'}, {foo: 'baz'}];
      var cmd = 'data.json -info + -o format=json';
      var out = await api.applyCommands(cmd, {'data.json': data});
      var d = JSON.parse(out['info.json'])[0];
      assert.equal(d.layer_name, 'data');
      assert.equal(d.feature_count, 2);
    });
  })

  describe('save-to option', function() {

    it('no geometry', async function() {
      var data = [{foo: 'bar'}, {foo: 'baz'}];
      var cmd = '-i data.json -info save-to=info.json';
      var out = await api.applyCommands(cmd, {'data.json': data});
      var info = JSON.parse(out['info.json']);
      assert.deepEqual(info[0].attribute_data, [{field: 'foo', first_value: 'bar'}])
      assert.equal(info[0].layer_name, 'data');
    })

    it('geometry, no attributes', async function() {
      var data = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'Point',
          coordinates: [1, 1]
        }, {
          type: 'Point',
          coordinates: [0, 0]
        }]
      };
      var out = await api.applyCommands('-i points.json -info save-to info', {'points.json': data});
      var info = JSON.parse(out['info.json']);
      assert.strictEqual(info[0].attribute_data, null);
      assert.deepEqual(info[0].bbox, [0, 0, 1, 1]);
    })
  });

  describe('formatTableValue()', function () {

    it('string field', function() {
      var target = "'bar'";
      assert.equal(formatTableValue('bar', 0), target);
    });

    it('decimal field', function() {
      var target = '  -0.4';
      assert.equal(formatTableValue(-0.4, 4), target);
    });

    it('integer field', function() {
      var target = '333';
      assert.equal(formatTableValue(333, 3), target);
    });

    it('object field', function() {
      var target = '{"a":2}';
      assert.equal(formatTableValue({a: 2}, 0), target);
    });

    it('null value', function() {
      var target = 'null';
      assert.equal(formatTableValue(null, 0), target);
    });

    it('undefined value', function() {
      var target = 'undefined';
      assert.equal(formatTableValue(void 0, 0), target);
    });

    it('function', function() {
      var target = '[function]';
      assert.equal(formatTableValue(function() {}, 0), target);
    })

    it('NaN', function() {
      var target = 'NaN';
      assert.equal(formatTableValue(NaN, 0), target);
    })
  })

})