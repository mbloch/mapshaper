var api = require('../'),
  assert = require('assert'),
  fs = require('fs'),
  format = api.utils.format;

function fixPath(p) {
  return require('path').join(__dirname, p);
}

function runFile(cmd, done) {
  var args = require('shell-quote').parse(cmd);
  var mapshaper = fixPath("../bin/mapshaper");
  var execFile = require('child_process').execFile;

  execFile(mapshaper, args, function(err, stdout, stderr) {
    done(err, stdout && stdout.toString(), stderr && stderr.toString());
  });
}

function runCmd(cmd, input, done) {
  var args = require('shell-quote').parse(cmd);
  var mapshaper = fixPath("../bin/mapshaper");
  var str = api.utils.format("echo '%s' | %s %s", input, mapshaper, cmd);
  var exec = require('child_process').exec;

  exec(str, function(err, stdout, stderr) {
    done(err, stdout && stdout.toString(), stderr && stderr.toString());
  });
}

describe('stdin/stdout tests', function() {
  // Travis fails on these tests -- removing for now.
  return;
  it ("pass-through GeoJSON", function(done) {
    var cmd = "- -o - -verbose"; // -verbose to check that messages aren't sent to stdout
    var geojson = {"type":"GeometryCollection","geometries":[{"type":"Point","coordinates":[0,0]}]};
    runCmd(cmd, JSON.stringify(geojson), function(err, stdout, stderr) {
      assert.deepEqual(JSON.parse(stdout), geojson);
      done();
    });
  })

  it ("pass-through TopoJSON", function(done) {
    var cmd = "/dev/stdin -info -o /dev/stdout -verbose"; // -info and -verbose to check that messages aren't sent to stdout
    var json = {type: "Topology",
      arcs: [],
      objects: { point: {
          "type":"GeometryCollection",
          "geometries":[{"type":"Point","coordinates":[0,0]}]}}
    };

    runCmd(cmd, JSON.stringify(json), function(err, stdout, stderr) {
      assert.deepEqual(JSON.parse(stdout), json);
      done();
    });
  })

})


describe('mapshaper-commands.js', function () {

  var states_shp = fixPath("test_data/two_states.shp"),
      counties_shp = fixPath("test_data/six_counties.shp"),
      states_csv = fixPath("test_data/states.csv");

  describe('layer naming tests', function() {

    it('"-innerlines +" creates an unnamed line layer', function(done) {
      var cmds =  api.internal.parseCommands(states_shp + " -innerlines +");
      api.internal.runParsedCommands(cmds, null, function(err, dataset) {
        assert.equal(dataset.layers.length, 2);
        assert.equal(dataset.layers[1].geometry_type, "polyline");
        assert(!dataset.layers[1].name);
        done();
      });
    });

    it('"-innerlines + name=innerlines" creates a named output layer', function(done) {
      var cmds =  api.internal.parseCommands(states_shp + " -innerlines + name=innerlines");
      api.internal.runParsedCommands(cmds, null, function(err, dataset) {
        assert.equal(dataset.layers[1].name, 'innerlines');
        done();
      });
    });

    it('"-lines +" creates an unnamed line layer', function(done) {
      var cmds =  api.internal.parseCommands(states_shp + " -lines +");
      api.internal.runParsedCommands(cmds, null, function(err, dataset) {
        if (err) console.log(err)
        assert.equal(dataset.layers.length, 2);
        assert.equal(dataset.layers[1].geometry_type, "polyline");
        assert(!dataset.layers[1].name);
        done();
      });
    });
  });

  describe('processFileContent()', function () {
    it('imports & exports csv file', function (done) {
      var input = "id,name\n0,foo";
      api.internal.processFileContent("-i", input, function(err, data) {
        assert.deepEqual(data, [{
          content: input,
          filename: 'layer1.csv'
        }]);
        done();
      })
    })

    it('imports & exports tsv file', function (done) {
      var input = "id\tname\n0\tfoo";
      api.internal.processFileContent("-i", input, function(err, data) {
        assert.deepEqual(data, [{
          content: input,
          filename: 'layer1.tsv'
        }]);
        done();
      })
    })

    it('converts csv to tsv', function (done) {
      var input = "id,name\n0,foo";
      api.internal.processFileContent("-o format=tsv", input, function(err, data) {
        assert.deepEqual(data, [{
          content: "id\tname\n0\tfoo",
          filename: 'layer1.tsv'
        }]);
        done();
      })
    })

    it('converts geojson to tsv', function (done) {
      var input = {
        type: "FeatureCollection",
        features: [{
          type: "Point",
          geometry: null,
          properties: {
            id: 0,
            name: 'foo'
          }
        }]
      };
      api.internal.processFileContent("-o format=tsv", input, function(err, data) {
        assert.deepEqual(data, [{
          content: "id\tname\n0\tfoo",
          filename: 'layer1.tsv'
        }]);
        done();
      })
    })

    it('converts csv to geojson points', function(done) {
      var input = "lat,lng,name\n40.724,-73.925,New York City";
      var target = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {
            lat: 40.724,
            lng: -73.925,
            name: "New York City"
          },
          geometry: {
            type: "Point",
            coordinates: [-73.925, 40.724]
          }
        }]
      };
      api.internal.processFileContent("-points x=lng y=lat -o format=geojson", input, function(err, data) {
        if (err) throw err;
        var output = JSON.parse(data[0].content);
        assert.deepEqual(output, target);
        // TODO: figure out naming
        // assert.equal(data[0].filename, 'layer1.json');
        done();
      })
    })

  })

  describe('applyCommands()', function () {
    it('import GeoJSON points as string', function (done) {
      var json = fs.readFileSync(fixPath('test_data/three_points.geojson'), 'utf8');
      api.applyCommands('', json, function(err, output) {
        assert.deepEqual(JSON.parse(json), JSON.parse(output));
        done();
      });
    })

    it('import GeoJSON points as object', function (done) {
      var json = fs.readFileSync(fixPath('test_data/three_points.geojson'), 'utf8');
      json = JSON.parse(json);
      api.applyCommands('', json, function(err, output) {
        assert.deepEqual(JSON.parse(output), json);
        done();
      });
    })

    it('convert GeoJSON points to TopoJSON', function (done) {
      var geojson = {
        type: "GeometryCollection",
        geometries: [{
          type: "Point",
          coordinates: [0.1, 0.1]
        }]
      };
      var topojson = {
        type: "Topology",
        arcs: [],
        objects: {
          layer1: {
            type: "GeometryCollection",
            geometries: [{
              type: "Point",
              coordinates: [0, 0]
            }]
          }
        }
      };
      api.applyCommands('-o format=topojson precision=1', geojson, function(err, output) {
        assert.deepEqual(JSON.parse(output), topojson);
        done();
      });
    })

    it('-o command accepts target= option', function(done) {
      var topojson = {
        type: "Topology",
        arcs: [],
        objects: {
          layer1: {
            type: "GeometryCollection",
            geometries: [{
              type: "Point",
              coordinates: [0, 0]
            }]
          },
          layer2: {
            type: "GeometryCollection",
            geometries: [{
              type: "Point",
              coordinates: [1, 1]
            }]
          }
        }
      };

      api.applyCommands('-o target=layer2', topojson, function(err, output) {
        var obj = JSON.parse(output);
        assert.equal(obj.objects.layer1, undefined);
        assert.deepEqual(obj.objects.layer2, topojson.objects.layer2);
        done();
      });

    });

    it('import GeoJSON points with rounding on import', function (done) {
     var geojson = {
        type: "GeometryCollection",
        geometries: [{
          type: "Point",
          coordinates: [0.1, 0.1]
        }]
      };
      var target = {
        type: "GeometryCollection",
        geometries: [{
          type: "Point",
          coordinates: [0, 0]
        }]
      };
      api.applyCommands('-i precision=1', geojson, function(err, output) {
        assert.deepEqual(JSON.parse(output), target);
        done();
      });
    })

    it('invalid dataset gives error', function(done) {
      api.applyCommands('', {}, function(err, output) {
        assert.equal(err.name, 'APIError');
        done();
      })

    })
  })

  describe('runCommands()', function() {

    it('Error: empty command string', function(done) {
      mapshaper.runCommands("", function(err) {
        assert(!!err);
        assert.equal(err.name, 'APIError')
        done();
      });
    })

    it('No error: -v command', function(done) {
      mapshaper.runCommands("-v", function(err) {
        assert(!err);
        done();
      });
    });

    it('Error: no dataset, no -i command', function(done) {
      mapshaper.runCommands("-info", function(err) {
        assert.equal(err.name, 'APIError');
        done();
      });
    });

    it('Error: no callback', function() {
      assert.throws(function() {
        mapshaper.runCommands("-v");
      });
    });

    it('Error: -i missing a file', function(done) {
      mapshaper.runCommands("-i oops.shp", function(err) {
        assert.equal(err.name, 'APIError');
        done();
      });
    });

    it('Error: unknown command', function(done) {
      mapshaper.runCommands("-i " + states_shp + " -amplify", function(err) {
        assert.equal(err.name, 'APIError');
        done();
      });
    });

    it('Error: -join missing a file', function(done) {
      mapshaper.runCommands("-i " + states_shp + " -join oops.json", function(err) {
        assert.equal(err.name, 'APIError');
        done();
      });
    });

    it('Callback returns dataset for imported file', function(done) {
      mapshaper.runCommands("-i " + states_shp, function(err, dataset) {
        assert.equal(dataset.layers[0].name, 'two_states');
        done();
      });
    });

  });


  describe('-dissolve', function () {

    it('test 1', function(done) {
      var cmd = format("-i %s -dissolve + copy-fields NAME,STATE_FIPS sum-fields POP2000,MULT_RACE", counties_shp);
        api.runCommands(cmd, function(err, data) {
        assert.equal(data.layers.length, 2);
        var lyr1 = data.layers[0]; // original lyr
        assert.equal(lyr1.data.size(), 6); // original data table hasn't been replaced

        var lyr2 = data.layers[1]; // dissolved lyr
        assert.deepEqual(lyr2.data.getRecords(),
            [{NAME: 'District of Columbia', STATE_FIPS: '11', POP2000: 1916238, MULT_RACE: 76770}]);
        done();
      })
    })

  })

  describe('-split', function () {

    it('test 1', function(done) {
      var cmd = format("-i %s -split STATE", states_shp);
      api.runCommands(cmd, function(err, data) {
        assert.equal(data.layers.length, 2);
        assert.equal(data.layers[0].shapes.length, 1);
        assert.equal(data.layers[1].shapes.length, 1);
        done();
      })
    })

  })
})
