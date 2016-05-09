var api = require('../'),
  assert = require('assert');

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('mapshaper-options.js', function () {

  describe('import', function () {
    var file1 = fixPath("test_data/two_states.shp"),
        file2 = fixPath("test_data/two_states.json"),
        file3 = fixPath("test_data/two_states.shx");

    bad("-i precision " + file1);
    bad("-i precision 0 " + file1);
    // filename expansion
    good('-i snap', {auto_snap: true}); // same as auto-snap
    good('-i auto-snap', {auto_snap: true});
    good('-i', {}); // now accepting no files
    good("-i " + file1, {files: [file1]});
    good("-i no-topology " + file1 + " auto-snap precision 0.1",
      {files: [file1], auto_snap: true, no_topology: true, precision: 0.1});
    good("-i " + file1 + " snap-interval 0.001", {snap_interval: 0.001, files: [file1]});
    good("-i merge-files " + file1 + " " + file2, {merge_files: true, files: [file1, file2]});
    good("-i combine-files " + file1 + " " + file2, {combine_files: true, files: [file1, file2]});
    good("-", {stdin: true});
    good("/dev/stdin", {stdin: true});
    good("file.shp name=states", {files:['file.shp'], name: 'states'})
    good("file.shp name=", {files:['file.shp'], name: ''})
    good("file.shp name=''", {files:['file.shp'], name: ''})
    good("file.shp name='a b'", {files:['file.shp'], name: 'a b'})
    good("file.shp name 'a b'", {files:['file.shp'], name: 'a b'})
    good("file.shp name ''", {files:['file.shp'], name: ''})
    good("file.shp name '' no-topology", {files:['file.shp'], name: '', no_topology: true})
 })

  describe('output', function() {
    var dir1 = fixPath("test_data");
    bad("-o output.shx");
    bad("-o output.shp output.json"); // only one file per -o command

    good("-o", {});
    good("-o " + dir1, {output_dir: dir1});
    good("-o output.topojson", {output_file: "output.topojson"});
    good("-o output.shp target=points", {output_file: "output.shp", target: "points"});
    good("-o cut-table output.json", {cut_table: true, output_file: "output.json"});
    good("-o cut-table", {cut_table: true})
    good("-o drop-table", {drop_table: true})
    good("-o -", {stdout: true})
    good("-o /dev/stdout", {stdout: true})

    // topojson options
    good("-o quantization 10000", {quantization: 10000});
    good("-o no-quantization", {no_quantization: true});
    good("-o quantization=10000", {quantization: 10000});
    bad("-o quantization");
    bad("-o quantization 0");
    bad("-o quantization -1000");
    good("-o id-field FID", {id_field: ["FID"]});
    good("-o bbox", {bbox: true});

    // valid formats
    good("-o format=topojson", {format: "topojson"});
    good("-o format=shapefile", {format: "shapefile"});
    good("-o format=geojson", {format: "geojson"});
    good("-o format=TopoJSON", {format: "topojson"});
    good("-o format=Shapefile", {format: "shapefile"});
    good("-o format=GeoJSON", {format: "geojson"});
    good("-o format=csv", {format: "dsv", delimiter: ","});
    good("-o format=tsv", {format: "dsv", delimiter: "\t"});
    good("-o format=dbf", {format: "dbf"});
    good("-o format=json", {format: "json"});

    // invalid formats
    bad("-o topojson");
    bad("-o shapefile");
    bad("-o geojson");
    bad("-o format=shp");
    bad("-o format \"ESRI Shapefile\"");

    // csv
    bad("-o format=csv delimiter=~");
    good("-o format=csv delimiter=\\t", {format: "dsv", delimiter: "\t"});
    good("-o format=csv delimiter='\\t'", {format: "dsv", delimiter: "\t"});
  })

  describe('each', function() {
    good('-each target=filtered \'name="foo"', {target: 'filtered', expression: 'name="foo"'});
  });

  describe('simplify', function() {
    bad("-s") // no alias (add one?)
    bad("-simplify cartesian i 0.001")
    good("-simplify visvalingam 10%", {method: "visvalingam", pct: 0.1})
    good("-simplify cartesian 1%", {planar: true, pct: 0.01})

    // invalid method names
    // now handled in simplify function
    //bad("-simplify 4% method=douglas-peucker");

    // assigning to a boolean or set variable is wrong
    bad('-simplify 5% keep-shapes=true');
    bad('-simplify 5% dp=true');

    good("-simplify 0%", {pct: 0});
    good("-simplify 0%", {pct: 0});
    good("-simplify 4%", {pct: 0.04});
    good("-simplify 0.04", {pct: 0.04});
    good("-simplify pct=4%", {pct: 0.04});
    good("-simplify pct=.04", {pct: 0.04});
    good("-simplify pct 4%", {pct: 0.04});
    bad("-simplify 10");
    bad("-simplify -5%");
    bad("-simplify 101%");
    bad("-simplify pct=101%");
    good("-simplify keep-shapes rdp 10%", {keep_shapes: true, method: "dp", pct: 0.1});
    bad("-simplify interval=10km"); // need integer
    bad("-simplify pct");
    bad("-simplify 10km");
    good("-simplify 3% no-repair", {pct: 0.03, no_repair: true});
  })

  describe('filter-fields', function () {
    good('-filter-fields STATE,FIPS:STATE_FIPS', {fields:["STATE", "FIPS:STATE_FIPS"]});
    good('-filter-fields', {fields: []});
  })

  describe('filter', function () {
    good('-filter true', {expression: 'true'});
    good('-filter \'id=="OR"\'', {expression: 'id=="OR"'});
    good('-filter name=="foo"', {expression: 'name=="foo"'});
  })

  describe('join', function() {
    var file1 = fixPath("test_data/two_states.dbf"),
        file2 = fixPath("test_data/two_states.shp");

    good("-join " + file1 + " keys ID,FIPS fields FIPS,NAME", {source: file1, keys: ["ID","FIPS"], fields: ["FIPS","NAME"]})
    good("-join " + file1 + " keys ID,FIPS", {source: file1, keys: ["ID","FIPS"]}) // fields are optional
    good("-join " + file1 + " keys=ID,FIPS unjoined unmatched", {source: file1, keys: ['ID', 'FIPS'], unjoined: true, unmatched: true});
  })

  describe('clip', function () {
    good("-clip bbox=0,-23.1,1,1.2e6)", {bbox: [0, -23.1, 1, 1.2e6]});
    good("-clip polys.shp remove-slivers", {source: 'polys.shp', remove_slivers: true})
    good("-clip polys.shp cleanup", {source: 'polys.shp', remove_slivers: true}) // rename old option
    bad("-clip");
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
    bad("-dissolve name -o"); // expects name=<lyr name>
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

  describe('proj', function() {
    good("-proj lambertcc lat0=47.0 lng0=-119 lat1=47.5 lat2=48.73333333333333", {
      projection: 'lambertcc',
      lat0: 47,
      lat1: 47.5,
      lng0: -119,
      lat2: 48.73333333333333
    });
  })

  describe('syntax rules', function () {
    good("--help", {}); // all commands accept -- prefix
    bad("-dummy") // unknown command
  })

})

function bad(str) {
  it(str, function() {
    assert.throws(function() {
      api.internal.parseCommands(str);
    });
  })
}

function good(str, reference) {
  it(str, function() {
    var parsed = api.internal.parseCommands(str);
    var target = parsed[0].options;
    assert.deepEqual(target, reference);
  })
}
