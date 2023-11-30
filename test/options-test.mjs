import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;


describe('mapshaper-options.js', function () {

  describe('import', function () {
    var file1 = "test/data/two_states.shp",
        file2 = "test/data/two_states.json",
        file3 = "test/data/two_states.shx";

    bad("-i precision " + file1);
    bad("-i precision 0 " + file1);
    // filename expansion
    good('-i snap', {snap: true});
    good('-i auto-snap', {snap: true});
    good('-i', {}); // now accepting no files
    good("-i " + file1, {files: [file1]});
    good("-i no-topology " + file1 + " auto-snap precision 0.1",
      {files: [file1], snap: true, no_topology: true, precision: 0.1});
    good("-i " + file1 + " snap-interval 0.001", {snap_interval: '0.001', files: [file1]});
    good("-i " + file1 + " snap-interval 1ft", {snap_interval: '1ft', files: [file1]});
    good("-i merge-files " + file1 + " " + file2, {merge_files: true, files: [file1, file2]});
    good("-i combine-files " + file1 + " " + file2, {combine_files: true, files: [file1, file2]});
    good("-", {stdin: true});
    good("/dev/stdin", {stdin: true});
    good("files=states.json", {files:['states.json']});
    good("files=states.json,counties.json", {files:['states.json', 'counties.json']});
    good("file.shp name=states", {files:['file.shp'], name: 'states'});
    good("file.shp name=", {files:['file.shp'], name: ''});
    good("file.shp name=''", {files:['file.shp'], name: ''});
    good("file.shp name='a b'", {files:['file.shp'], name: 'a b'});
    good("file.shp name 'a b'", {files:['file.shp'], name: 'a b'});
    good("file1.shp file2.shp", {files:['file1.shp', 'file2.shp']}); // accepts multiple files
    // disallowing whitespace tokens
    // good("file.shp name ''", {files:['file.shp'], name: ''})
    // good("file.shp name '' no-topology", {files:['file.shp'], name: '', no_topology: true})
    bad("file.shp name ''");
 })

  describe('output', function() {
    var dir1 = "test/data";
    bad("-o output.shx");
    bad("-o output.shp output.json"); // only one file per -o command

    good("-o", {});
    good("-o " + dir1, {directory: dir1});
    good("-o output.topojson", {file: "output.topojson"});
    good("-o output.shp target=points", {file: "output.shp", target: "points"});
    good("-o cut-table output.json", {cut_table: true, file: "output.json"});
    good("-o cut-table", {cut_table: true})
    good("-o drop-table", {drop_table: true})
    good("-o -", {stdout: true})
    good("-o /dev/stdout", {stdout: true})

    good("-o field-order=ascending", {field_order: "ascending"})
    bad("-o field-order=descending");

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

  describe('colorizer', function () {
    good('-colorizer breaks=0,10 colors="red white blue" name=col', {name: "col", breaks: [0, 10], colors: ["red", "white", "blue"]})
    good('-colorizer categories="good,bad" colors=\'"#000", "white"\'',
        {categories: ['good', 'bad'], colors: ['#000', 'white']});
    // TODO: accept arguments like: colors="#000","#FFF"
  })

  describe('innerlines', function () {
    bad("-innerlines FIELD"); // doesn't take an argument
  })

  describe('each', function() {
    good('-each target=filtered \'name="foo"', {target: 'filtered', expression: 'name="foo"'});
  });

  describe('simplify', function() {
    bad("-simplify cartesian i 0.001")
    good("-simplify visvalingam 10%", {method: "visvalingam", percentage: '10%'})
    good("-simplify cartesian 1%", {planar: true, percentage: '1%'})

    // invalid method names
    // now handled in simplify function
    //bad("-simplify 4% method=douglas-peucker");

    // assigning to a boolean or set variable is wrong
    bad('-simplify 5% keep-shapes=true');
    bad('-simplify 5% dp=true');

    good("-simplify 0%", {percentage: '0%'});
    good("-simplify 0%", {percentage: '0%'});
    good("-simplify 4%", {percentage: '4%'});
    good("-simplify 0.04", {percentage: '0.04'});
    good("-simplify percentage=4%", {percentage: '4%'});
    good("-simplify percentage=.04", {percentage: '.04'});
    good("-simplify percentage 4%", {percentage: '4%'});
    // percentage validation now occurs in -simplify command
    // bad("-simplify 10");
    // bad("-simplify -5%");
    // bad("-simplify 101%");
    // bad("-simplify percentage=101%");
    // bad("-simplify 10km");
    good("-simplify keep-shapes rdp 10%", {keep_shapes: true, method: "dp", percentage: '10%'});
    // bad("-simplify interval=10km"); // need integer
    bad("-simplify percentage");
    good("-simplify 3% no-repair", {percentage: '3%', no_repair: true});
  })

  describe('filter-fields', function () {
    good('-filter-fields STATE,FIPS:STATE_FIPS', {fields:["STATE", "FIPS:STATE_FIPS"]});
    good('-filter-fields', {});
  })

  describe('filter', function () {
    good('-filter true', {expression: 'true'});
    good('-filter \'id=="OR"\'', {expression: 'id=="OR"'});
    good('-filter name=="foo"', {expression: 'name=="foo"'});
  })

  describe('join', function() {
    var file1 ="test/data/two_states.dbf",
        file2 = "test/data/two_states.shp";

    good("-join " + file1 + " keys ID,FIPS fields FIPS,NAME", {source: file1, keys: ["ID","FIPS"], fields: ["FIPS","NAME"]})
    good("-join " + file1 + " keys ID,FIPS", {source: file1, keys: ["ID","FIPS"]}) // fields are optional
    good("-join " + file1 + " keys=ID,FIPS unjoined unmatched", {source: file1, keys: ['ID', 'FIPS'], unjoined: true, unmatched: true});

    good("-join data.tsv field-types=FIPS:str keys=GEOID,FIPS", {source: 'data.tsv', keys: ['GEOID', 'FIPS'], field_types: ['FIPS:str']});
    bad("-join data.tsv field-types:FIPS:str keys=GEOID,FIPS"); // catch invalid field-types argument
  })

  describe('clip', function () {
    good("-clip bbox=0,-23.1,1,1.2e6)", {bbox: [0, -23.1, 1, 1.2e6]});
    good("-clip polys.shp remove-slivers", {source: 'polys.shp', remove_slivers: true})
    // good("-clip polys.shp cleanup", {source: 'polys.shp', remove_slivers: true}) // rename old option
    // bad("-clip"); // no longer doing validation in option parsing
  })

  describe('lines', function () {
    good("-lines", {});
    good("-lines STATE", {fields: ['STATE']});
    good("-lines STATE,COUNTY", {fields: ['STATE', 'COUNTY']});
  })

  describe('split-on-grid', function() {
    // bad("-split-on-grid"); // invalid grid handled downstream
    good("-split-on-grid 2", {cols: 2, rows: 2});
    good("-split-on-grid 5,3", {cols: 5, rows: 3});
  })

  describe('dissolve', function() {
    good("-dissolve", {});
    good("-dissolve STATE", {fields: ['STATE']});
    good("-dissolve STATE,REGION", {fields: ['STATE', 'REGION']});
    good("-dissolve name=foo", {name: "foo"});
    good("-dissolve FIPS sum-fields POP copy-fields NAME,FIPS", {fields: ["FIPS"], copy_fields: ["NAME", "FIPS"], sum_fields: ["POP"]});
    bad("-dissolve STATE COUNTY");
    bad("-dissolve name -o"); // expects name=<lyr name>
  })

  describe('split', function () {
    good("-split", {});
    good("-split STATE", {expression: 'STATE'});
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
    good("-proj +proj=merc +ellps=sphere", {
      crs: '+proj=merc +ellps=sphere'
    });

    good("-proj albersusa densify", {
      crs: 'albersusa',
      densify: true
    });

    good("-proj crs='+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs'", {
      crs: '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs'
    });

    // projection= is alias for crs=, for backwards compatibility
    good("-proj projection=albersusa densify", {
      crs: 'albersusa',
      densify: true
    });

    bad("-proj");
    // bad("-proj merc +ellps=sphere") // this kind of error is now caught elsequere
  })

  describe('syntax rules', function () {
    // all commands accept alternative -- prefix
    good("--help", {});

    // -<command>=<value> syntax throws an error
    bad('-target=layer1');

  })


  describe('Undefined command (gets parsed as tokens)', function() {

    it('no arguments: empty token array', function() {
      var parsed = internal.parseCommands('-dummy');
      assert.deepEqual(parsed, [{name: 'dummy', _: [], options: {}}])
    });

    it ('arguments are imported as tokens', function() {
      var parsed = internal.parseCommands('-dummy a   b=c  d=e,f ');
      assert.deepEqual(parsed, [{name: 'dummy', _: ['a', 'b=c', 'd=e,f'], options: {}}])
    });
  })

})

function bad(str) {
  it(str, function() {
    assert.throws(function() {
      internal.parseCommands(str);
    });
  })
}

function good(str, reference) {
  it(str, function() {
    var parsed = internal.parseCommands(str);
    var target = parsed[0].options;
    assert.deepEqual(target, reference);
  })
}
