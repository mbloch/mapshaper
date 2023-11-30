import assert from 'assert';
import api from '../mapshaper.js';
import fs from 'fs';
var utils = api.utils;

function simplifyGeoJsonContent(contentStr, simplifyArgs, cb) {
  var cmd = '-i data.json -simplify ' + simplifyArgs + ' -o';
  api.applyCommands(cmd, {'data.json': contentStr}, function(err, output) {
    if (err) return cb(err);
    cb(null, output['data.json'].toString());
  });
}

function sameOutputTest(contentStr, standardArgs, variableArgs, done) {
  simplifyGeoJsonContent(contentStr, standardArgs, function(err, output) {
    simplifyGeoJsonContent(contentStr, variableArgs, function(err, output2) {
      if (err) {
        console.log(err)
      }
      assert(!err);
      assert.equal(output2.length, output.length);
      // console.log(contentStr.length, output.length, output2.length, output == output2);
      done();
    })
  });
}

describe("mapshaper-variable-simplify.js", function() {

  describe('Variable simplification', function() {
    var boxes = {
      type: 'GeometryCollection',
      geometries: [{
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
      }, {
        type: 'Polygon',
        coordinates: [[[2, 0], [2, 1], [3, 1], [3, 0], [2, 0]]]
      }]
    };

    it ('remove one box, retain the other', function(done) {
      var cmd='-i data.json -each "id = this.id" -simplify variable percentage="id === 0 ? \'100%\' : \'0%\'" -o gj2008';
      api.applyCommands(cmd, {'data.json': boxes}, function(err, output) {
        var data2 = JSON.parse(output['data.json']);
        var target = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {id: 0},
            geometry: boxes.geometries[0]
          }, {
            type: 'Feature',
            properties: {id: 1},
            geometry: null
          }]
        };
        assert.deepEqual(data2, target);
        done();
      })
    })

    it ('If two features share the same arc, the less-simplified feature wins', function(done) {
      var lines = {
        type: 'GeometryCollection',
        geometries: [{
          type: 'LineString',
          coordinates: [[0, 0], [0, 1], [1, 1]]
        }, {
          type: 'LineString',
          coordinates: [[0, 0], [0, 1], [1, 1]]
        }]
      };
      var cmd = '-i data.json -simplify percentage=\'this.id == 0 ? "0%" : "100%"\' variable -o gj2008';
      api.applyCommands(cmd, {'data.json': lines}, function(err, output) {
        var data2 = JSON.parse(output['data.json']);
        assert.deepEqual(data2, lines);
        done();
      })

    })
  })

  describe('-variable simplify has same output as standard simplify when applied uniformly', function () {
    var content = fs.readFileSync('test/data/six_counties_three_null.json')
    it('5%', function (done) {
      sameOutputTest(content, '10%', 'variable percentage=\'"10" + "%"\'', done);
    })

    it('0% keep-shapes', function (done) {
      sameOutputTest(content, '0% keep-shapes', 'variable keep-shapes percentage=\'true && "0%"\'', done);
    })

    it('resolution=800', function (done) {
      sameOutputTest(content, 'resolution=800', 'variable resolution=800', done);
    })

    it('interval=1km', function (done) {
      sameOutputTest(content, 'interval=0.1km', 'variable interval=true&&"0.1km"', done);
    })

  })
})
