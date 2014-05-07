var api = require('../'),
  assert = require('assert');

function fixPath(p) {
  return api.internal.Node.path.join(__dirname, p);
}

describe('mapshaper-options.js', function () {
  describe('import', function () {
    var file1 = fixPath("test_data/two_states.shp"),
        file2 = fixPath("test_data/two_states.json"),
        file3 = fixPath("test_data/two_states.shx");

    bad("-i"); // no file
    bad("-i missing.json"); // missing file
    bad("-i precision " + file1);
    bad("-i precision 0 " + file1);

    good("-i " + file1, {files: [file1]});
    good("-i no-topology " + file1 + " auto-snap precision 0.1",
      {files: [file1], auto_snap: true, no_topology: true, precision: 0.1});
  })

  describe('output', function() {
    var dir1 = fixPath("test_data");
    bad("-o output.shx");
    bad("-o output.shp output.json"); // only one file per -o command

    good("-o", {});
    good("-o " + dir1, {output_dir: dir1});
    good("-o output.shp", {output_file: "output.shp"});
    good("-o cut-table output.json", {cut_table: true, output_file: "output.json"})

    // topojson options
    good("-o format=topojson", {format: "topojson"});
    good("-o quantization 10000", {quantization: 10000});
    good("-o q=10000", {quantization: 10000});
    bad("-o quantization");
    bad("-o quantization 0");
    bad("-o quantization -1000");
    good("-o id-field FID", {id_field: "FID"});
  })

  describe('simplify', function() {
    bad("-s") // no alias (add one?)
    good("-simplify cartesian i 0.001", {interval: 0.001, cartesian: true})
    good("-simplify visvalingam p 0.1", {method: "visvalingam", pct: 0.1})
    bad("-simplify p 0.1 method=douglas-peucker");
    good("-simplify 4%", {pct: 0.04});
    bad("-simplify 10");
    bad("-simplify -5%");
    good("-simplify keep-shapes rdp 10%", {keep_shapes: true, method: "dp", pct: 0.1});
    bad("-simplify interval=10km"); // need integer
    bad("-simplify pct");
  })

  describe('split-on-grid', function() {
    bad("-split-on-grid");
    good("-split-on-grid 2", {cols: 2, rows: 2});
    good("-split-on-grid 5,3", {cols: 5, rows: 3});
  })

})

function bad(str) {
  var args = str.split(/ +/);
  it(str, function() {
    assert.throws(function() {
      api.internal.parseCommands(args);
    });
  })
}

function good(str, target) {
  var args = str.split(/ +/);
  it(str, function() {
    assert.deepEqual(api.internal.parseCommands(args)[0].options, target);
  })
}
