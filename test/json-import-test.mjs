import assert from 'assert';
import { identifyJSONString, importJSON } from '../src/io/mapshaper-json-import';


describe('mapshaper-json-import.js', function () {
  describe('identifyJSONString()', function () {
    function identify(str) {
      return identifyJSONString(str);
    }

    it('Arrays of JSON records are type "json"', function () {
      assert.equal(identify('[]'), 'json');
      assert.equal(identify('\n [ \n {'), 'json');
    })


    it('TopoJSON', function() {
      assert.equal(identify('{\n"type": "TopoJSON", "arcs":\n[]'), 'topojson');
      assert.equal(identify('{ "objects": {'), 'topojson');
      assert.equal(identify(' { "bbox": [0,0,0,0], "transform": {"'), 'topojson');
    })

    it('GeoJSON', function() {
      assert.equal(identify('{\n"type": "Point", "coordinates":\n['), 'geojson');
      assert.equal(identify('{ "features": ['), 'geojson');
      assert.equal(identify(' {\r"geometries": ['), 'geojson');
    })

  })

  describe('importJSON() releases the caller\'s buffer reference', function () {
    // When the caller passes an ArrayBuffer/Buffer, the importer extracts
    // a string copy (or hands the buffer to a streaming reader) and then
    // nulls input.content, so V8 can reclaim the source bytes before
    // JSON.parse/buildTopology run on the much larger parsed object.
    it('nulls input.content after converting ArrayBuffer to string', function () {
      var json = '{"type":"FeatureCollection","features":[]}';
      var buf = Buffer.from(json);
      var input = {filename: 'test.json', content: buf};
      var result = importJSON(input, {});
      assert(result.dataset, 'parsed dataset returned');
      assert.equal(input.content, null, 'caller\'s buffer reference released');
    });

    it('nulls input.content for plain Buffer input', function () {
      var json = '{"type":"FeatureCollection","features":[]}';
      var input = {filename: 'test.json', content: Buffer.from(json)};
      importJSON(input, {});
      assert.equal(input.content, null);
    });

    it('leaves input.content alone when content is already a string (it IS the data)', function () {
      var input = {filename: 'test.json', content: '{"type":"FeatureCollection","features":[]}'};
      importJSON(input, {});
      // String input is the parse target; nulling it would lose data.
      // Confirms we don't accidentally clobber the string-input path.
      assert.equal(typeof input.content, 'string');
    });
  });
})
