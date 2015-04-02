var api = require('../'),
  assert = require('assert'),
  format = api.utils.format;

var states_shp = "test/test_data/two_states.shp";

describe('mapshaper-filter-rename-fields.js', function () {

  describe('-filter-fields', function () {

    it("test 1: retain two fields, rename one", function (done) {
      var cmd = format("-i %s -filter-fields NAME=STATE_NAME,FIPS", states_shp);
      api.runCommands(cmd, function(err, data) {
        assert.deepEqual(data.layers[0].data.getFields(), ['NAME', 'FIPS']);
        done();
      })
    })

    it("test 2 -- drop all fields", function (done) {
      var cmd = format("-i %s -filter-fields", states_shp);
      api.runCommands(cmd, function(err, data) {
        assert.deepEqual(data.layers[0].data.getFields(), []);
        done();
      })
    })
  })

  describe('-rename-fields', function () {
    it("test 1: rename two fields", function (done) {
      var cmd = format("-i %s -rename-fields lat=LAT,lng=LONG", states_shp);
      api.runCommands(cmd, function(err, data) {
        assert.deepEqual(data.layers[0].data.getFields(), ['lat', 'lng', 'STATE_NAME', 'FIPS', 'STATE']);
        done();
      })
    })

  });

});