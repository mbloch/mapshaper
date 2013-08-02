var mapshaper = require('../'),
  cli = mapshaper.cli,
  assert = require('assert'),
  optimist = require('optimist'),
  path = require("path");

process.chdir(__dirname); // cd to test/ directory

/*
var dataDir = path.join(__dirname, "test_data"),
    tmpDir = path.join(__dirname, "__tmp__");
*/

// Convert string of commandline options to optimist argv
//
function parseOpts(str) {
  var parts = str.split(/[\s]+/); // TODO: handle quoted strings
  return optimist.parse(parts);
}


describe('mapshaper-cli.js', function() {

  describe('validateSimplifyOpts()', function() {

    var good1 = "-p 0.2",
        good2 = "-i 2000 --dp -k",
        good3 = "-k --vis -p .9";

    // var ok1 = "-p 0.4 -i 5000";

    var bad1 = "-p 10",
        bad2 = "-p 4%",
        bad3 = "-i 200km",
        bad4 = "-i",
        bad5 = "-p",
        bad6 = "";

    function validate(str) {
      var argv = parseOpts(str);
      var opts = mapshaper.cli.validateSimplifyOpts({}, argv);
      return opts;
    }

    it(good1, function() {
      assert.deepEqual(validate(good1), {
        use_simplification: true,
        simplify_pct: 0.2,
        keep_shapes: false,
        simplify_method: "mod"
      });
    })

    it(good2, function() {
      assert.deepEqual(validate(good2), {
        use_simplification: true,
        simplify_interval: 2000,
        keep_shapes: true,
        simplify_method: "dp"
      });
    })

    it(good3, function() {
      assert.deepEqual(validate(good3), {
        use_simplification: true,
        simplify_pct: 0.9,
        keep_shapes: true,
        simplify_method: "vis"
      });
    })

    it(bad1 + " (invalid)", function() {
      assert.throws(function(){validate(bad1)});
    })

    it(bad2 + " (invalid)", function() {
      assert.throws(function(){validate(bad2)});
    })

    it(bad3 + " (invalid)", function() {
      assert.throws(function(){validate(bad3)});
    })

    it(bad4 + " (invalid)", function() {
      assert.throws(function(){validate(bad4)});
    })

    it(bad5 + " (invalid)", function() {
      assert.throws(function(){validate(bad5)});
    })

  })


  describe('validateInputOpts()', function() {

    function validate(str) {
      var argv = parseOpts(str);
      var opts = mapshaper.cli.validateInputOpts({}, argv);
      return opts;
    }

    var good1 = "test_data/two_states.shp";
    it(good1, function() {
      assert.deepEqual(validate(good1), {
        input_file: "test_data/two_states.shp"
      });
    })

    var bad1 = "test_data/two_states";
    it(bad1 + " (missing file extension)", function() {
      assert.throws(function(){validate(bad1)});
    })

    var bad2 = "missing.shp";
    it(bad2 + " (file not found)", function() {
      assert.throws(function(){validate(bad2)});
    })

    var bad3 = "-o output.shp";
    it(bad3 + " (no input file given)", function() {
      assert.throws(function(){validate(bad3)});
    })
  })

  describe('validateOutputOpts()', function() {

    function validate(str) {
      var argv = parseOpts(str),
          opts = {};
      mapshaper.cli.validateInputOpts(opts, argv);
      mapshaper.cli.validateOutputOpts(opts, argv);
      // console.log(opts)
      return opts;
    }

    var good1 = "test_data/two_states.shp";
    it(good1, function() {
      assert.deepEqual(validate(good1), {
        input_file: "test_data/two_states.shp",
        output_directory: ".",
        output_extension: "shp",
        output_file_base: "two_states"
      });
    })

    var good2 = "test_data/two_states.shp -o simplified";
    it(good2, function() {
      assert.deepEqual(validate(good2), {
        input_file: "test_data/two_states.shp",
        output_directory: ".",
        output_extension: "shp",
        output_file_base: "simplified"
      });
    })

    var good3 = "test_data/two_states.shp -o test_data/simplified.shp";
    it(good3, function() {
      assert.deepEqual(validate(good3), {
        input_file: "test_data/two_states.shp",
        output_extension: "shp",
        output_directory: "test_data",
        output_file_base: "simplified"
      });
    })

    var good4 = "test_data/two_states.json";
    it(good4, function() {
      assert.deepEqual(validate(good4), {
        input_file: "test_data/two_states.json",
        output_extension: "json",
        output_directory: ".",
        output_file_base: "two_states"
      });
    })

    var good5 = "test_data/two_states.json -f shapefile";
    it(good5, function() {
      assert.deepEqual(validate(good5), {
        input_file: "test_data/two_states.json",
        output_format: 'shapefile',
        output_directory: ".",
        output_extension: "shp",
        output_file_base: "two_states"
      });
    })

    var good6 = "test_data/two_states.shp -f topojson";
    it(good6, function() {
      assert.deepEqual(validate(good6), {
        input_file: "test_data/two_states.shp",
        output_format: 'topojson',
        output_directory: ".",
        output_extension: "json",
        output_file_base: "two_states"
      });
    })

    var good7 = "test_data/two_states.json -f geojson -o test_data/min";
    it(good7, function() {
      assert.deepEqual(validate(good7), {
        input_file: "test_data/two_states.json",
        output_format: 'geojson',
        output_directory: "test_data",
        output_extension: "json",
        output_file_base: "min"
      });
    })

    var bad2 = "test_data/two_states.shp -o missing/simplified.shp";
    it(bad2 + " (-o file in a missing directory)", function() {
      assert.throws(function() {validate(bad2)});
    })

    var bad3 = "test_data/two_states.shp -o test_data";
    it(bad3 + " (-o doesn't accept directory name)", function() {
      assert.throws(function() {validate(bad3)});
    })

    var bad4 = "test_data/two_states.shp -o test_data/two_states/../two_states.shp";
    it(bad4 + " (missing directory)", function() {
      assert.throws(function() {validate(bad4)});
    })

  })

  describe('testFileCollision()', function () {
    it('no collision -> false', function () {
      assert.ok(
        !cli.testFileCollision([{pathbase: "missing", extension: "shp"}], "")
      )
    })

    it('collison -> true', function() {
      assert.ok(
        cli.testFileCollision([{pathbase: "test_data/two_states", extension: "shp"}], "")
        );
    })

    it('collision + unique suffix -> false', function() {
      assert.ok(
        !cli.testFileCollision([{pathbase: "test_data/two_states", extension: "shp"}], "-ms")
        );
    })
  })

  describe('getOutputPaths()', function () {
    it('add -ms extension to resolve collision', function () {
      assert.deepEqual(["test_data/two_states-ms.shp"],
        mapshaper.getOutputPaths(
          [{filebase: "two_states"}], "test_data", "shp"));
    })
  })
})
