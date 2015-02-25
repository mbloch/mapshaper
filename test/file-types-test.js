var api = require('../'),
  assert = require('assert');

describe('mapshaper-file-types.js', function () {

  describe('inferOutputFormat()', function () {
    it('.json -> geojson', function () {
      assert.equal(api.internal.inferOutputFormat("file.json"), "geojson");
    })

    it('.json + topojson -> topojson', function () {
      assert.equal(api.internal.inferOutputFormat("file.json", "topojson"), "topojson");
    })

    it('.topojson -> topojson', function () {
      assert.equal(api.internal.inferOutputFormat("file.topojson"), "topojson");
    })

    it('.shp -> shapefile', function () {
      assert.equal(api.internal.inferOutputFormat("file.shp"), "shapefile");
    })

    it('.txt -> dsv', function () {
      assert.equal(api.internal.inferOutputFormat("file.txt"), 'dsv');
    })

    it('.dbf -> dbf', function () {
      assert.equal(api.internal.inferOutputFormat("file.dbf"), 'dbf');
    })

    it('.csv -> dsv', function () {
      assert.equal(api.internal.inferOutputFormat("file.csv"), 'dsv');
    })

    it('.tsv -> dsv', function () {
      assert.equal(api.internal.inferOutputFormat("file.tsv"), 'dsv');
    })

  })

  describe('filenameIsUnsupportedOutputType()', function () {
    var test = api.internal.filenameIsUnsupportedOutputType;
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
