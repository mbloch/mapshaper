import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;


describe('mapshaper-json-import.js', function () {
  describe('identifyJSONString()', function () {
    function identify(str) {
      return internal.identifyJSONString(str);
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
})
