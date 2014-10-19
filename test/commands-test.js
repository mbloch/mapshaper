var api = require('../'),
  assert = require('assert'),
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

  describe('runCommands()', function() {

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

    it('Error: missing a file', function(done) {
      mapshaper.runCommands("-i oops.shp", function(err) {
        assert.equal(err.name, 'APIError');
        done();
      });
    });

    it('Callback returns dataset', function(done) {
      mapshaper.runCommands("-i " + states_shp, function(err, dataset) {
        assert.equal(dataset.layers[0].name, 'two_states');
        done();
      });
    });

  });

  describe('-filter-fields', function () {

    it("test 1", function (done) {
      var cmd = format("-i %s -filter-fields NAME=STATE_NAME,FIPS", states_shp);
      api.runCommands(cmd, function(err, data) {
        assert.deepEqual(data.layers[0].data.getFields(), ['NAME', 'FIPS']);
        done();
      })
    })

    it("test 2 -- drop fields)", function (done) {
      var cmd = format("-i %s -filter-fields", states_shp);
      api.runCommands(cmd, function(err, data) {
        assert.deepEqual(data.layers[0].data.getFields(), []);
        done();
      })
    })
  })

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

  describe('-join', function () {

    it('test 1', function(done) {
      var cmd = format("-i %s -join %s keys=FIPS,STATE_FIPS:str fields=POP2010,SUB_REGION", states_shp, states_csv),
          target = [{"STATE_NAME":"Oregon","FIPS":"41","STATE":"OR","LAT":43.94,"LONG":-120.55,"POP2010":3831074,"SUB_REGION":"Pacific"},
          {"STATE_NAME":"Washington","FIPS":"53","STATE":"WA","LAT":47.38,"LONG":-120.00,"POP2010":6724540,"SUB_REGION":"Pacific"}];
      api.runCommands(cmd, function(err, data) {
        assert.deepEqual(data.layers[0].data.getRecords(), target);
        done();
      })

    })

  })

  describe('wildcardToRxp()', function () {
    var ex1 = "layer1"
    it(ex1, function () {
      assert.equal(api.utils.wildcardToRegExp(ex1).source, 'layer1');
    })

    var ex2 = "layer*";
    it(ex2, function() {
      assert.equal(api.utils.wildcardToRegExp(ex2).source, 'layer.*');
    })
  })

  describe('findMatchingLayers()', function () {

    it("simple match", function () {
      var layers = [{name: 'layer1'}, {name: 'layer2'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, 'layer1'),
        [{name: 'layer1'}]);
    })

    it("missing layer", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, 'layer3'),[]);
    });

    it("comma sep. + wildcard", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, 'points,layer*'),
        [{name: 'points'}, {name: 'layer1'}, {name: 'layer2'}]);
    })

    it("all layers (*)", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '*'),
        [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}]);
    })

    it("numerically indexed layers", function() {
      var layers = [{name: 'layer1'}, {name: 'layer2'}, {name: 'points'}, {name: 'polygons'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '0,2'),
        [{name: 'layer1'}, {name: 'points'}]);
    })

    it("no dupes", function() {
      var layers = [{name: 'points'}, {name: 'layer2'}];
      assert.deepEqual(api.internal.findMatchingLayers(layers, '1,layer2,layer*,1'),
        [{name: 'layer2'}]);
    })

  })
})
