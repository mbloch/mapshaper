var mapshaper = require('../'),
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

    var good1 = "test_data/two_states.shp";

    var bad1 = "test_data/two_states",
        bad2 = "missing.shp",
        bad3 = "-o output.shp"

    function validate(str) {
      var argv = parseOpts(str);
      var opts = mapshaper.cli.validateInputOpts({}, argv);
      return opts;
    }

    it(good1, function() {
      assert.deepEqual(validate(good1), {
        input_file: "test_data/two_states.shp",
        input_directory: "test_data",
        input_path_base: "test_data/two_states",
        input_file_base: "two_states",
        input_format: "shapefile"
      });
    })

    it(bad1 + " (missing .shp extension)", function() {
      assert.throws(function(){validate(bad1)});
    })

    it(bad2 + " (file not found)", function() {
      assert.throws(function(){validate(bad2)});
    })

    it(bad3 + " (no input file given)", function() {
      assert.throws(function(){validate(bad3)});
    })
  })

  describe('validateOutputOpts()', function() {

    var good1 = "test_data/two_states.shp";
    var good2 = "test_data/two_states.shp -o simplified";
    var good3 = "test_data/two_states.shp -o test_data/simplified.shp";

    var bad1 = "test_data/two_states.shp -o test_data/two_states",
        bad2 = "test_data/two_states.shp -o missing/simplified.shp",
        bad3 = "test_data/two_states.shp -o test_data",
        bad4 = "test_data/two_states.shp -o test_data/two_states/../two_states.shp";
        bad5 = "./test_data/two_states.shp -o test_data/two_states";



    function validate(str) {
      var argv = parseOpts(str),
          opts = {};
      mapshaper.cli.validateInputOpts(opts, argv);
      mapshaper.cli.validateOutputOpts(opts, argv);
      // console.log(opts)
      return opts;
    }

    it(good1, function() {
      assert.deepEqual(validate(good1), {
        input_file: "test_data/two_states.shp",
        input_directory: "test_data",
        input_path_base: "test_data/two_states",
        input_file_base: "two_states",
        input_format: "shapefile",
        output_format: "shapefile",
        output_path_base: "two_states-mshp"
      });
    })

    it(good2, function() {
      assert.deepEqual(validate(good2), {
        input_file: "test_data/two_states.shp",
        input_directory: "test_data",
        input_path_base: "test_data/two_states",
        input_file_base: "two_states",
        input_format: "shapefile",
        output_format: "shapefile",
        output_path_base: "simplified"
      });
    })

    it(good3, function() {
      assert.deepEqual(validate(good3), {
        input_file: "test_data/two_states.shp",
        input_directory: "test_data",
        input_path_base: "test_data/two_states",
        input_file_base: "two_states",
        input_format: "shapefile",
        output_format: "shapefile",
        output_path_base: "test_data/simplified"
      });
    })


    it(bad1 + " (invalid)", function() {
      assert.throws(function() {validate(bad1)});
    })

    it(bad2 + " (invalid)", function() {
      assert.throws(function() {validate(bad2)});
    })

    it(bad3 + " (invalid)", function() {
      assert.throws(function() {validate(bad3)});
    })

    it(bad4 + " (invalid)", function() {
      assert.throws(function() {validate(bad4)});
    })

    it(bad5 + " (invalid)", function() {
      assert.throws(function() {validate(bad5)});
    })
  })
})