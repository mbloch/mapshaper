var fs = require('fs'),
    api = require('..'),
    assert = require('assert'),
    GeoJSONReader = api.internal.GeoJSONReader,
    FileReader = api.internal.FileReader;

function Reader(str, chunkLen) {
  var buf = toBuf(str);
  chunkLen = chunkLen || 256;

  this.getBuffer = function(offs) {
    return buf.slice(offs, Math.min(chunkLen, buf.length));
  };

  this.toString = function() {return str;};

  this.expandBuffer = function() {
    chunkLen *= 2;
    return this;
  };
}

function toBuf(str) {
  return new Buffer(str, 'utf8');
}

function toString(buf) {
  return buf.toString('utf8');
}

function parseTest(input, output) {
  var features = [];
  var reader = new Reader(JSON.stringify(input));
  new GeoJSONReader(reader).parse(function(o) {features.push(o)}, function() {});
  assert.deepEqual(features, output);
}

describe('test Reader', function () {
  it('chunk len greater than buf len', function() {
    var str = "foo bar";
    var r = new Reader(str, 256);
    assert.equal(r.getBuffer(0).toString('utf8'), str);
  })

  it('chunk len less than buf len', function() {
    var str = "foo bar";
    var r = new Reader(str, 4);
    assert.equal(r.getBuffer(0).toString('utf8'), "foo ");
    r.expandBuffer();
    assert.equal(r.getBuffer(0).toString('utf8'), "foo bar");
  })
})

describe('geojson-reader.js', function () {

  describe('FileReader', function () {
    it('buffer larger than file cache', function () {
      var reader = new FileReader('test/test_data/lorem.txt', {cacheSize: 2, bufferSize: 4});
      assert.equal(toString(reader.getBuffer(2)), 'rem ');
      assert.equal(toString(reader.getBuffer(0)), 'lore'); // go back in file
      reader.expandBuffer();
      assert.equal(toString(reader.getBuffer(0)), 'lorem ip');
      assert.equal(toString(reader.expandBuffer().getBuffer(0)), 'lorem ipsum'); // end of file
    })

    it('file cache larger than file', function () {
      var reader = new FileReader('test/test_data/lorem.txt', {cacheSize: 0x1000, bufferSize: 2});
      assert.equal(toString(reader.getBuffer(2)), 're');
      assert.equal(toString(reader.expandBuffer().getBuffer(6)), 'ipsu');
      assert.equal(toString(reader.expandBuffer().getBuffer(10)), 'm'); // end of file
      assert.equal(toString(reader.getBuffer(0)), 'lorem ip'); // go back in file
    })

    it('buffer same size as file', function () {
      var reader = new FileReader('test/test_data/lorem.txt', {cacheSize: 0x1000, bufferSize: 11});
      assert.equal(toString(reader.getBuffer(0)), 'lorem ipsum');
      assert.equal(toString(reader.getBuffer(1)), 'orem ipsum');
      assert.equal(toString(reader.getBuffer(2)), 'rem ipsum');
      assert.equal(toString(reader.getBuffer(10)), 'm');
    })

    it('try to read beyond file end', function() {
      var reader = new FileReader('test/test_data/lorem.txt', {cacheSize: 0x1000, bufferSize: 12});
      assert.equal(toString(reader.getBuffer(11)), ''); // at eof: return empty buffer
      assert.throws(function() {
        reader.getBuffer(12);
      });
    })
  })

  describe('GeoJSONReader()', function () {

    describe('parseFile()', function () {
      it('test1', function () {
        var json = {
          type: "Point",
          coordinates: [0, 0]
        };
        parseTest(json, [json]);
      })

      it('test2', function () {
        var json = {type: 'GeometryCollection', geometries: [{
          type: "Point",
          coordinates: [0, 0]
        }, {
          type: "Point",
          coordinates: [1, 1]
        }]};
        parseTest(json, json.geometries);
      })

      it('test3', function () {
        var json = {type: 'FeatureCollection', features: [{
          type: 'Feature',
          geometry: {
            type: "Point",
            coordinates: [0, 0]
          },
          properties: {foo: {}}
        }]};
        parseTest(json, json.features);
      })

      it('file reading test', function() {
        var file = 'test/test_data/three_points.geojson';
        var reader = new FileReader(file);
        var features = [];
        var contents = require('fs').readFileSync(file, 'utf8');
        var target = JSON.parse(contents).features;
        new GeoJSONReader(reader).parse(function(feat) {features.push(feat)}, function() {});
        assert.deepEqual(features, target);

      });

    })
    /*
    describe('extractText()', function () {
      it('full text', function () {
        var str = 'hello, world';
        assert.equal(api.extractText(toBuf(str), 0, str.length), str)
      });

      it('skip last two chars', function () {
        var str = 'hello, world';
        assert.equal(api.extractText(toBuf(str), 0, str.length - 2), 'hello, wor')
      });

      it('skip first two chars', function () {
        var str = 'hello, world';
        assert.equal(api.extractText(toBuf(str), 2, str.length), 'llo, world')
      });
    });
    */

    describe('findString', function () {
      it('test1', function () {
        var json = '{"type": "FeatureCollection", "features": []}';
        var reader = new Reader(json);
        var target = {
          text: '{"type": "FeatureCollection", ',
          offset: 40
        };
        assert.deepEqual(new GeoJSONReader(reader).findString(0, 'features'), target);
      })

      it('test2', function () {
        var json = '{"type": "FeatureCollection", "features": []}';
        var reader = new Reader(json);
        var target = {
          text: '{"type": ',
          offset: 28
        };
        assert.deepEqual(new GeoJSONReader(reader).findString(0, 'FeatureCollection'), target);
      })

    })

    describe('readObject()', function () {
      it('test1', function () {
        var json = '{}';
        var reader = new GeoJSONReader(new Reader(json));
        var target = {text: '{}', offset: 2};
        assert.deepEqual(reader.readObject(0), target);
      })

      it('test2', function () {
        var json = '{"foo": {"type": "Point"}}';
        var reader = new GeoJSONReader(new Reader(json));
        var target = {text: '{"type": "Point"}', offset: 25};
        assert.deepEqual(reader.readObject(6), target);
      })

      it('test3', function () {
        var json = '{"foo": {"type": "Point"}}';
        var reader = new GeoJSONReader(new Reader(json));
        var target = {text: '{"foo": {"type": "Point"}}', offset: 26};
        assert.deepEqual(reader.readObject(0), target);
      })

      it('test4', function () {
        var json = '{"a": "}\""}\\\"}"}';
        var reader = new GeoJSONReader(new Reader(json));
        var target = {text: '{"a": "}\""}\\\"}"}', offset: 16};
        assert.deepEqual(reader.readObject(0), target);
      })

      it('test5', function () {
        var json = '[{"a": 0},\n{"b": 1}]';
        var reader = new GeoJSONReader(new Reader(json));
        var target = {text: '{"b": 1}', offset: 19};
        assert.deepEqual(reader.readObject(9), target);
      })

    })

  })

})
