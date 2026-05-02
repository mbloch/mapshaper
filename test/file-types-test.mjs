import assert from 'assert';
import {
  filenameIsUnsupportedOutputType,
  guessInputType,
  stringLooksLikeJSON,
  stringLooksLikeCsv,
  unescapeInlineCsv
} from '../src/io/mapshaper-file-types';
import { inferOutputFormat } from '../src/io/mapshaper-output-format';


describe('mapshaper-file-types.js', function () {

  describe('guessInputType()', function() {
    var guess = guessInputType;
    it('identifies known file types', function() {
      assert.equal(guess(null, {type: 'FeatureCollection'}), 'json');
      assert.equal(guess('input.txt', 'NAME,FOO'), 'text');
      assert.equal(guess('/dev/stdin', '{type:FeatureCollection,features:[]}'), 'json');
      assert.equal(guess('/dev/stdin', 'NAME,FOO'), 'text');
      assert.equal(guess('/dev/stdin', null), null);
      assert.equal(guess('input.shp', null), 'shp');
      assert.equal(guess('input.dbf', null), 'dbf');
      assert.equal(guess('input.gpkg', null), 'gpkg');
      assert.equal(guess('input.parquet', null), 'parquet');
      assert.equal(guess('input.geoparquet', null), 'parquet');
      assert.equal(guess('input.prj', null), 'prj');
      assert.equal(guess('input.SHP', null), 'shp');
      assert.equal(guess('input.DBF', null), 'dbf');
      assert.equal(guess('input.GPKG', null), 'gpkg');
      assert.equal(guess('input.PARQUET', null), 'parquet');
      assert.equal(guess('input.GEOPARQUET', null), 'parquet');
      assert.equal(guess('input.PRJ', null), 'prj');
    })
  })


  describe('inferOutputFormat()', function () {
    it('.json -> geojson', function () {
      assert.equal(inferOutputFormat("file.json"), "geojson");
    })

    it('.json + topojson -> topojson', function () {
      assert.equal(inferOutputFormat("file.json", "topojson"), "topojson");
    })

    it('.topojson -> topojson', function () {
      assert.equal(inferOutputFormat("file.topojson"), "topojson");
    })

    it('.shp -> shapefile', function () {
      assert.equal(inferOutputFormat("file.shp"), "shapefile");
    })

    it('.txt -> dsv', function () {
      assert.equal(inferOutputFormat("file.txt"), 'dsv');
    })

    it('.dbf -> dbf', function () {
      assert.equal(inferOutputFormat("file.dbf"), 'dbf');
    })

    it('.fgb -> flatgeobuf', function () {
      assert.equal(inferOutputFormat("file.fgb"), 'flatgeobuf');
    })

    it('.gpkg -> geopackage', function () {
      assert.equal(inferOutputFormat("file.gpkg"), 'geopackage');
    })

    it('.csv -> dsv', function () {
      assert.equal(inferOutputFormat("file.csv"), 'dsv');
    })

    it('.tsv -> dsv', function () {
      assert.equal(inferOutputFormat("file.tsv"), 'dsv');
    })

  })

  describe('stringLooksLikeJSON()', function() {
    it('JSON Object', function() {
      assert(stringLooksLikeJSON(' {"type": "FeatureCollection", "features": []}'));
    })
    it('JSON Array', function() {
      assert(stringLooksLikeJSON(' [{"id": 0}]'));
    })
    it('whitespace', function() {
      assert(!stringLooksLikeJSON(' \n'));
    })
  })

  describe('stringLooksLikeCsv()', function() {
    it('detects literal-newline CSV string', function() {
      assert(stringLooksLikeCsv('lat,lon,label\\n48.86,2.35,Paris'));
    })
    it('detects real-newline CSV string', function() {
      assert(stringLooksLikeCsv('lat,lon,label\n48.86,2.35,Paris'));
    })
    it('detects CRLF-escape CSV string', function() {
      assert(stringLooksLikeCsv('a,b\\r\\n1,2'));
    })
    it('rejects ordinary filenames with no newline', function() {
      assert(!stringLooksLikeCsv('data/cities.csv'));
      assert(!stringLooksLikeCsv('a,b,c'));
    })
    it('rejects single-line CSV (header only)', function() {
      assert(!stringLooksLikeCsv('lat,lon,label\\n'));
      assert(!stringLooksLikeCsv('lat,lon,label\n'));
    })
    it('rejects strings with newline but no commas', function() {
      assert(!stringLooksLikeCsv('foo\\nbar'));
      assert(!stringLooksLikeCsv('foo\nbar'));
    })
    it('rejects strings where only one line has a comma', function() {
      assert(!stringLooksLikeCsv('a,b\\nfoo'));
      assert(!stringLooksLikeCsv('foo\\na,b'));
    })
    it('rejects empty string and non-strings', function() {
      assert(!stringLooksLikeCsv(''));
      assert(!stringLooksLikeCsv(null));
      assert(!stringLooksLikeCsv(undefined));
      assert(!stringLooksLikeCsv(42));
    })
  })

  describe('unescapeInlineCsv()', function() {
    it('converts \\n escapes to real newlines', function() {
      assert.equal(unescapeInlineCsv('a,b\\n1,2'), 'a,b\n1,2');
    })
    it('converts \\r\\n escapes to a single newline', function() {
      assert.equal(unescapeInlineCsv('a,b\\r\\n1,2'), 'a,b\n1,2');
    })
    it('preserves real-newline strings verbatim', function() {
      // backslash-n inside cells is preserved when input already has real newlines
      assert.equal(unescapeInlineCsv('a,b\n1,\\n'), 'a,b\n1,\\n');
    })
    it('passes non-string values through', function() {
      assert.equal(unescapeInlineCsv(null), null);
    })
  })

  describe('filenameIsUnsupportedOutputType()', function () {
    var test = filenameIsUnsupportedOutputType;
    it('unsupported types -> true', function () {
      assert(test('filename.gdb'))
      assert(test('filename.shx'))
    })

    it('supported and unknown types -> false', function() {
      assert(!test('/dev/stdout'))
      assert(!test('output.shp'))
      assert(!test('output.txt'))
      assert(!test('somename'))
    })
  })

});
