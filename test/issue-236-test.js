var fs = require('fs'),
    api = require('..'),
    assert = require('assert'),
    GeoJSONReader = api.internal.GeoJSONReader,
    FileReader = api.internal.FileReader,
    StringReader = require('./helpers.js').Reader;

describe('Issue #236: Failing to export GeoJson files', function () {
  it ('Feature collection with crs property', function() {

    var file = 'test/data/issues/236/point.geojson';
    var reader = new FileReader(file);
    var features = [];
    var contents = require('fs').readFileSync(file, 'utf8');
    var target = JSON.parse(contents).features;
    new GeoJSONReader(reader).readObjects(function(feat) {features.push(feat)});
    assert.deepEqual(features, target);
  });

});
