import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import child_process from 'child_process';
import sq from 'shell-quote';

var format = api.utils.format,
    mapshaper = api;

var states_shp = "test/data/two_states.shp";

async function runFile(cmd, done) {
  var args = sq.parse(cmd);
  var mapshaper = "./bin/mapshaper";

  child_process.execFile(mapshaper, args, function(err, stdout, stderr) {
    done(err, stdout && stdout.toString(), stderr && stderr.toString());
  });
}

function runCmd(cmd, input, done) {
  var args = sq.parse(cmd);
  var mapshaper = "./bin/mapshaper";
  var str = api.utils.format("echo '%s' | %s %s", input, mapshaper, cmd);

  child_process.exec(str, function(err, stdout, stderr) {
    done(err, stdout && stdout.toString(), stderr && stderr.toString());
  });
}

describe('mapshaper-run-commands.js', function () {


  it('when two files are processed in sequence and second file triggers error, no output is generated', function(done) {
      var input = {
        'data.csv': 'id\n0\n1',
        'data2.json': '{'
      };
      api.applyCommands('-i data.csv data2.json -o', input, function(err, output) {
        assert.equal(err.name, 'UserError');
        assert.equal(output, null);
        done();
      })
    });

  it('Fix: -i command throws error when there are multiple target datasets',async function() {
    var a = 'foo\na';
    var b = 'bar\nb';
    var c = 'baz\nc';
    var cmd = '-i a.csv -i b.csv -target * -i c.csv -o';
    var out = await api.applyCommands(cmd, {'a.csv': a, 'b.csv': b, 'c.csv': c});
    assert.equal(out['c.csv'], c);
  })

  describe('Issue #264 applyCommands()', function() {
    it ('should throw error if input is a file path, not file content', function(done) {
      mapshaper.applyCommands('-i input.shp -o out.json', {'input.shp': 'test/data/two_states.shp'}, function(
        err, output) {
        assert(!!err);
        done();
      });
    });
  })

  describe('User-reported bug: wildcard expansion in Windows', function () {
    it('files are processed, no error thrown', function (done) {
      // this duplicates the error (Windows shell doesn't expand wildcards,
      // but bash does)
      var cmd = '-i test/data/issues/166/*.dbf -o format=csv';
      api.applyCommands(cmd, {}, function(err, output) {
        assert(!err);
        assert('a_utm.csv' in output);
        assert('b_utm.csv' in output);
        done();
      });
    })
  })

  describe('stdin/stdout tests', function() {

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

  describe('context tests', function () {
    it('context vars are reset after commands run', function (done) {
      var cmd = '-i test/data/three_points.geojson -verbose';
      api.runCommands(cmd, function(err) {
        setTimeout(function() {
          assert.strictEqual(api.internal.getStashedVar('VERBOSE'), undefined);
          assert.deepEqual(api.internal.getStashedVar('input_files'), undefined);
          done();
        },1);
        assert.strictEqual(api.internal.getStashedVar('VERBOSE'), undefined);
        assert.deepEqual(api.internal.getStashedVar('input_files'), undefined);
      });
    })
  })

  describe('layer naming tests', function() {

    it('Fix: name= option of second dataset ignored', function(done) {
      var input = {
        'a.json': [{a: 0}],
        'b.json': [{b: 1}]
      };
      api.applyCommands('-i a.json name=one -i b.json name=two -o target=*',
        input, function(err, output) {
          assert.deepEqual(JSON.parse(output['one.json']), [{a: 0}]);
          assert.deepEqual(JSON.parse(output['two.json']), [{b: 1}]);
          done();
        })
    })

    it('"-innerlines +" creates an unnamed line layer', function(done) {
      var cmds =  api.internal.parseCommands(states_shp + " -innerlines +");
      api.internal.runParsedCommands(cmds, null, function(err, job) {
        var layer = job.catalog.getActiveLayer().layer;
        assert.equal(layer.geometry_type, "polyline");
        assert(!layer.name);
        done();
      });
    });

    it('"-innerlines + name=innerlines" creates a named output layer', function(done) {
      var cmds =  api.internal.parseCommands(states_shp + " -innerlines + name=innerlines");
      api.internal.runParsedCommands(cmds, null, function(err, job) {
        var lyr = job.catalog.getActiveLayer().layer;
        assert.equal(lyr.name, 'innerlines');
        done();
      });
    });

    it('"-lines +" creates an unnamed line layer', function(done) {
      var cmds =  api.internal.parseCommands(states_shp + " -lines +");
      api.internal.runParsedCommands(cmds, null, function(err, job) {
        if (err) console.log(err)
        var dataset = job.catalog.getActiveLayer().dataset;
        assert.equal(dataset.layers.length, 2);
        assert.equal(dataset.layers[1].geometry_type, "polyline");
        assert(!dataset.layers[1].name);
        done();
      });
    });
  });

  describe('applyCommands()', function () {
    it('Returns a Promise if no callback is passed', function() {
      var promise = mapshaper.applyCommands('-v');
      assert(!!promise.then);
    });

    it('Promise errors on invalid syntax', function(done) {
      mapshaper.applyCommands('foo').then(function() {
        done(new Error('expected an error'));
      }).catch(function(e) {
        done();
      });
    });

    it('Promise returns data', function() {
      var input = [{foo: 'bar'}];
      return mapshaper.applyCommands('-i foo.json -o', {'foo.json': input}).then(function(data) {
        var output = JSON.parse(data['foo.json']);
        assert.deepEqual(output, input);
      });
    });

    it('works with -clip command', function(done) {

      var poly = {
        "type": "Feature",
        "geometry": {
        "type": "Polygon",
        "coordinates": [
        [
        [-114.345703125, 39.4369879],
        [-116.4534998, 37.18979823791],
        [-118.4534998, 38.17698709],
        [-115.345703125, 43.576878],
        [-106.611328125, 43.4529188935547],
        [-105.092834092, 46.20938402],
        [-106.66859, 39.4389646],
        [-103.6117867, 36.436756],
        [-114.34579879, 39.4361929]
        ] ]
        }
      };

      var clip_poly = {
        "type": "Feature",
        "geometry": {
        "type": "Polygon",
        "coordinates": [
        [
        [-114.345703125, 39.4361929993141],
        [-114.345703125, 43.4529188935547],
        [-106.611328125, 43.4529188935547],
        [-106.611328125, 39.4361929993141],
        [-114.345703125, 39.4361929993141]
        ] ]
        }
      };

      api.applyCommands('-i poly.json -clip clip_poly.json -o',
        {'poly.json': poly, 'clip_poly.json': clip_poly}, function(err, output) {
        assert(!!output && !err);
        done();
      })
    });


    it('missing file causes UserError', function(done) {
      api.applyCommands('-i data.csv', {}, function(err, output) {
        assert(err.name, 'UserError');
        done();
      })
    });

    it ('pass-through', function(done) {
      var input = {
        'data.csv': 'id\n0\n1'
      };
      api.applyCommands('-i data.csv -o', input, function(err, output) {
        assert.equal(output['data.csv'], 'id\n0\n1');
        done();
      })
    })


    it ('output from sequentially processed files is combined', function(done) {
      var input = {
        'data.csv': 'id\n0\n1',
        'data2.csv': 'id\n2\n3'
      };
      api.applyCommands('-i data.csv data2.csv -rename-fields FID=id -o', input, function(err, output) {
        assert.equal(output['data.csv'], 'FID\n0\n1');
        assert.equal(output['data2.csv'], 'FID\n2\n3');
        done();
      })
    })

    it('when two files are processed in sequence and second file triggers error, no output is generated', function(done) {
      var input = {
        'data.csv': 'id\n0\n1',
        'data2.json': '{'
      };
      api.applyCommands('-i data.csv data2.json -o', input, function(err, output) {
        assert.equal(err.name, 'UserError');
        assert.equal(output, null);
        done();
      })
    });

    it ('merge multiple files', function(done) {
      var input = {
        'data.csv': 'id\n0\n1',
        'data2.csv': 'id\n2\n3'
      };
      api.applyCommands('-i data.csv data2.csv combine-files -merge-layers -o merged.csv', input, function(err, output) {
        assert.equal(output['merged.csv'], 'id\n0\n1\n2\n3');
        done();
      })
    })

    it ('rename, convert csv', function(done) {
      var input = {
        'data.csv': 'id,count\n0,2\n1,4'
      };
      api.applyCommands('-i data.csv -o data2.tsv', input, function(err, output) {
        assert.equal(output['data2.tsv'], 'id\tcount\n0\t2\n1\t4');
        done();
      })
    })


    it ('accepts array of parsed commands', function(done) {
      var input = {
        'data.csv': 'id\n0\n1'
      };
      var commands = [{
        name: "i",
        options: {
          files: ['data.csv']
        }
      }, {
        name: "each",
        options: {
          expression: "id2 = id + 2"
        }
      }, {
        name: "o",
        options: {
          file: "out.csv"
        }
      }];
      api.applyCommands(commands, input, function(err, output) {
        assert.equal(output['out.csv'], 'id,id2\n0,2\n1,3');
        done();
      })
    })


    it('converts geojson to tsv', function (done) {
      var input = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: null,
          properties: {
            id: 0,
            name: 'foo'
          }
        }]
      };
      api.applyCommands("-i feature.json -o format=tsv", {'feature.json': input}, function(err, output) {
        assert.deepEqual(output, {
          'feature.tsv': "id\tname\n0\tfoo"
        });
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
      api.applyCommands("-i points.csv -points x=lng y=lat -o format=geojson", {'points.csv': input}, function(err, output) {
        var output = JSON.parse(output['points.json']);
        assert.deepEqual(output, target);
        done();
      })
    })


    it('accepts Buffer objects as input (Issue #159)', function(done) {
      var shp = fs.readFileSync('test/data/three_points.shp');
      var dbf = fs.readFileSync('test/data/three_points.dbf');
      var input = {
        'points.shp': shp,
        'points.dbf': dbf
      };
      var geojson = {"type":"FeatureCollection","features":[
        {"type":"Feature","geometry":{"type":"Point","coordinates":[-79.04411780507252,43.08771393436908]},"properties":{"name":"Niagara Falls"}},
        {"type":"Feature","geometry":{"type":"Point","coordinates":[-62.06181800038502,5.686896063275327]},"properties":{"name":"Salto Angel"}},
        {"type":"Feature","geometry":{"type":"Point","coordinates":[-54.58299719960377,-25.568291925005923]},"properties":{"name":"Iguazu Falls"}}
      ]};
      api.applyCommands('-i points.shp -filter-fields name -o -o format=geojson', input, function(err, output) {
        assert(output['points.shx'] instanceof Buffer);
        assert(output['points.shp'] instanceof Buffer);
        assert(output['points.dbf'] instanceof Buffer);
        assert.deepEqual(JSON.parse(output['points.json']), geojson);
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
          point: {
            type: "GeometryCollection",
            geometries: [{
              type: "Point",
              coordinates: [0, 0]
            }]
          }
        }
      };
      api.applyCommands('-i data.json name=point -o format=topojson precision=1', {'data.json': geojson}, function(err, output) {
        assert.deepEqual(JSON.parse(output['data.json']), topojson);
        done();
      });
    })

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
      api.applyCommands('-i precision=1 data.json -o', {'data.json': geojson}, function(err, output) {
        assert.deepEqual(JSON.parse(output['data.json']), target);
        done();
      });
    })

    it('invalid dataset gives error', function(done) {
      api.applyCommands('', {}, function(err, output) {
        assert.equal(err.name, 'UserError');
        done();
      })
    })
  })

  describe('runCommandsXL()', function () {
    it('Works with {xl: "4gb"} option + callback', function(done) {
      mapshaper.runCommandsXL('test/data/three_points.geojson -filter true', {xl: '4gb'}, function(err) {
        assert(!err);
        done();
      });
    });

    it('Works with no argument', function() {
      var promise = mapshaper.runCommandsXL('-v');
      assert(promise.then);
    });

    it('Works with {xl: 3gb} option + Promise', function() {
      var promise = mapshaper.runCommandsXL('-v', {xl: "3gb"});
      assert(promise.then);
    });

    it('Error on invalid xl option (callback)', function(done) {
      mapshaper.runCommandsXL('-v', {xl: "1000gb"}, function(err) {
        assert(!!err);
        done();
      });
    });

    it('Error on invalid xl option (promise)', function(done) {
      mapshaper.runCommandsXL('-v', {xl: "1000gb"}).then(function() {
        done(new Error('expected an error'));
      }).catch(function(e) {
        done();
      });
    });
  });

  describe('runCommands()', function () {

    it('Returns a Promise if no callback is passed', function() {
      var promise = mapshaper.runCommands('-v');
      assert(promise.then);
    });

    it('Promise errors on invalid syntax', function(done) {
      mapshaper.runCommands('foo').then(function() {
        done(new Error('expected an error'));
      }).catch(function(e) {
        done();
      });
    });

    it('Error: empty command string', function(done) {
      mapshaper.runCommands("", function(err) {
        assert(!!err);
        assert.equal(err.name, 'UserError')
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
        assert.equal(err.name, 'UserError');
        done();
      });
    });

    it('Error: -i missing a file', function(done) {
      mapshaper.runCommands("-i oops.shp", function(err) {
        assert.equal(err.name, 'UserError');
        done();
      });
    });

    it('Error: unknown command', function(done) {
      mapshaper.runCommands("-i " + states_shp + " -amplify", function(err) {
        assert.equal(err.name, 'UserError');
        done();
      });
    });

    it('Error: -join missing a file', function(done) {
      mapshaper.runCommands("-i " + states_shp + " -join oops.json", function(err) {
        assert.equal(err.name, 'UserError');
        done();
      });
    });

  })

  describe('testCommands()', function() {

    it('multiple input files are processed in sequence', function(done) {
      mapshaper.internal.testCommands('-i test/data/three_points.geojson test/data/one_point.geojson', function(err, dataset) {
          assert.deepEqual(dataset.info.input_files, ['test/data/one_point.geojson' ]);
          assert.equal(dataset.layers[0].name, 'one_point');
          done();
        });
    })

    it('Callback returns dataset for imported file', function(done) {
      mapshaper.internal.testCommands("-i " + states_shp, function(err, dataset) {
        assert.equal(dataset.layers[0].name, 'two_states');
        done();
      });
    });

  });


})
