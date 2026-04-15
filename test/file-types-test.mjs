import assert from 'assert';
import {
  filenameIsUnsupportedOutputType,
  guessInputType,
  stringLooksLikeJSON
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
      assert.equal(guess('input.prj', null), 'prj');
      assert.equal(guess('input.SHP', null), 'shp');
      assert.equal(guess('input.DBF', null), 'dbf');
      assert.equal(guess('input.GPKG', null), 'gpkg');
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
