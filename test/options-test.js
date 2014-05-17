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
    good("-i " + file1 + " snap-interval 0.001", {snap_interval: 0.001, files: [file1]});
    good("-i merge-files " + file1 + " " + file2, {merge_files: true, files: [file1, file2]});
    good("-i combine-files " + file1 + " " + file2, {combine_files: true, files: [file1, file2]});
 })

  describe('output', function() {
    var dir1 = fixPath("test_data");
    bad("-o output.shx");
    bad("-o output.shp output.json"); // only one file per -o command

    good("-o", {});
    good("-o " + dir1, {output_dir: dir1});
    good("-o output.shp target=points", {output_file: "output.shp", target: "points"});
    good("-o cut-table output.json", {cut_table: true, output_file: "output.json"})
    good("-o cut-table", {cut_table: true})

    // topojson options
    good("-o quantization 10000", {quantization: 10000});
    good("-o no-quantization", {no_quantization: true});
    good("-o quantization=10000", {quantization: 10000});
    bad("-o quantization");
    bad("-o quantization 0");
    bad("-o quantization -1000");
    good("-o id-field FID", {id_field: "FID"});
    good("-o bbox", {bbox: true});

    // valid formats
    good("-o format=topojson", {format: "topojson"});
    good("-o format=shapefile", {format: "shapefile"});
    good("-o format=geojson", {format: "geojson"});
    good("-o format=TopoJSON", {format: "topojson"});
    good("-o format=Shapefile", {format: "shapefile"});
    good("-o format=GeoJSON", {format: "geojson"});

    // invalid formats
    bad("-o topojson");
    bad("-o shapefile");
    bad("-o geojson");
    bad("-o format=csv");
    bad("-o format=tsv");
    bad("-o format=dbf");
    bad("-o format=shp");
    bad("-o format=json");
    bad("-o format \"ESRI Shapefile\"");

  })

  describe('simplify', function() {
    bad("-s") // no alias (add one?)
    good("-simplify cartesian i 0.001", {interval: 0.001, cartesian: true})
    good("-simplify visvalingam p 0.1", {method: "visvalingam", pct: 0.1})

    // invalid method names
    bad("-simplify p 0.1 method=douglas-peucker");
    bad("-simplify p 0.1 method=vis");

    // assigning to a boolean or set variable is wrong
    bad('-simplify 5% keep-shapes=true');
    bad('-simplify 5% dp=true');

    good("-simplify 4%", {pct: 0.04});
    bad("-simplify 10"); // only pct has this kind of shortcut
    bad("-simplify -5%");
    good("-simplify keep-shapes rdp 10%", {keep_shapes: true, method: "dp", pct: 0.1});
    bad("-simplify interval=10km"); // need integer
    bad("-simplify pct");
    good("-simplify 3% no-repair", {pct: 0.03, no_repair: true});
  })

  describe('fields', function () {
    good('-fields STATE,FIPS:STATE_FIPS', {fields:["STATE", "FIPS:STATE_FIPS"]});
    bad('-fields');
  })

  describe('join', function() {
    var file1 = fixPath("test_data/two_states.dbf"),
        file2 = fixPath("test_data/two_states.shp");

    good("-join " + file1 + " keys ID,FIPS fields FIPS,NAME", {file: file1, keys: ["ID","FIPS"], fields: ["FIPS","NAME"]})
    good("-join " + file1 + " keys ID,FIPS", {file: file1, keys: ["ID","FIPS"]}) // fields are optional
    bad("-join " + file2 + " keys ID,FIPS"); // .shp not joinable
    bad("-join " + file1); // missing keys
    bad("-join " + file1 + "keys ID"); // only one key
  })

  describe('lines', function () {
    good("-lines", {});
    good("-lines STATE", {fields: ['STATE']});
    good("-lines STATE,COUNTY", {fields: ['STATE', 'COUNTY']});
  })

  describe('split-on-grid', function() {
    bad("-split-on-grid");
    good("-split-on-grid 2", {cols: 2, rows: 2});
    good("-split-on-grid 5,3", {cols: 5, rows: 3});
  })

  describe('dissolve', function() {
    good("-dissolve", {});
    good("-dissolve STATE", {field: 'STATE'});
    good("-dissolve FIPS sum-fields POP copy-fields NAME,FIPS", {field: "FIPS", copy_fields: ["NAME", "FIPS"], sum_fields: ["POP"]});
    bad("-dissolve STATE COUNTY");
  })

  describe('split', function () {
    good("-split", {});
    good("-split STATE", {field: 'STATE'});
    bad("-split STATE COUNTY");
  })

  describe('merge-layers', function() {
    good("-merge-layers", {});
    bad("-merge-layers FIELD")
  })

  describe('subdivide', function() {
    good("-subdivide true", {expression: "true"});
    bad("-subdivide");
  })

  describe('information', function() {
    good("-encodings", {});
    good("-info", {});
    good("-version", {});
    good("-v", {});
    good("-verbose", {});
    good("-help", {});
    good("-h", {});

  })

  describe('syntax rules', function () {
    good("--help", {}); // all commands accept -- prefix
    bad("-dummy") // unknown command
  })

})

function bad(str) {
  var args = str.split(/ +/);
  it(str, function() {
    assert.throws(function() {
      api.internal.getOptionParser().parseArgv(args);
    });
  })
}

function good(str, target) {
  var args = str.split(/ +/);
  it(str, function() {
    assert.deepEqual(api.internal.getOptionParser().parseArgv(args)[0].options, target);
  })
}
