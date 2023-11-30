import fs from 'fs';
import api from '../mapshaper.js';
import assert from 'assert';
import helpers from './helpers';

var GeoJSONReader = api.internal.GeoJSONReader,
    FileReader = api.internal.FileReader,
    StringReader = helpers.Reader;

describe('Issue #236: Failing to export GeoJson files', function () {
  it ('Feature collection with crs property', function() {

    var file = 'test/data/issues/236/point.geojson';
    var reader = new FileReader(file);
    var features = [];
    var contents = fs.readFileSync(file, 'utf8');
    var target = JSON.parse(contents).features;
    new GeoJSONReader(reader).readObjects(function(feat) {features.push(feat)});
    assert.deepEqual(features, target);
  });

});
